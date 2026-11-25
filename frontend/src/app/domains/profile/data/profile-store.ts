import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { AuthClient } from '@app/shared/auth/data/auth-client';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { UpdateOwnProfileRequest, User } from '@app/shared/auth/models/auth';
import { BuildingsClient } from '@app/spaces/data/buildings-client';
import { FloorsClient } from '@app/spaces/data/floors-client';
import { ResourcesClient } from '@app/spaces/data/resources-client';
import { Building } from '@app/spaces/models/building';
import { Floor } from '@app/spaces/models/floor';
import { Resource } from '@app/spaces/models/resource';

/** The three pickers, by id; '' means "nothing chosen". */
export interface Selection {
  readonly building: string;
  readonly floor: string;
  readonly desk: string;
}

/** The profile and the part of its preferences that still exists in the catalog. */
export interface LoadedProfile {
  readonly user: User;
  readonly selection: Selection;
  /** A saved building, floor or desk no longer exists, so it was left out of `selection`. */
  readonly preferencesLost: boolean;
}

/**
 * How a picker's options came in: `gone` means the building or floor was deleted meanwhile
 * (retrying cannot help), `failed` that the request failed (retrying may).
 */
export type OptionsResult = 'ok' | 'gone' | 'failed';

export interface SaveFailure {
  /** Always set, for failures that cannot be shown next to a field. */
  readonly message: string;
  /** Server messages keyed by field, with the `preferences.` prefix removed. */
  readonly fieldErrors: Readonly<Record<string, string>>;
}

/**
 * The signed-in user's profile plus the options for the preference pickers. Floors and desks
 * are loaded for the chosen building and floor only, so a big catalog is never fetched whole.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly authClient = inject(AuthClient);
  private readonly auth = inject(AuthStore);
  private readonly buildingsClient = inject(BuildingsClient);
  private readonly floorsClient = inject(FloorsClient);
  private readonly resourcesClient = inject(ResourcesClient);

  private readonly _loaded = signal<LoadedProfile | null>(null);
  private readonly _buildings = signal<readonly Building[]>([]);
  private readonly _floors = signal<readonly Floor[]>([]);
  private readonly _desks = signal<readonly Resource[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);
  private readonly _floorsLoading = signal(false);
  private readonly _desksLoading = signal(false);
  private readonly _optionsError = signal<string | null>(null);

  // A slow answer for an earlier choice must not overwrite the options of the current one.
  private loadRun = 0;
  private floorsRun = 0;
  private desksRun = 0;

  readonly loaded = this._loaded.asReadonly();
  readonly buildings = this._buildings.asReadonly();
  readonly floors = this._floors.asReadonly();
  readonly desks = this._desks.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadError = this._loadError.asReadonly();
  readonly floorsLoading = this._floorsLoading.asReadonly();
  readonly desksLoading = this._desksLoading.asReadonly();
  /** Why the floors or desks of the current choice could not be loaded, if they could not. */
  readonly optionsError = this._optionsError.asReadonly();

  async load(): Promise<void> {
    const run = ++this.loadRun;
    // The store outlives a logout: never show the previous user's data while loading.
    this.floorsRun++;
    this.desksRun++;
    this._loaded.set(null);
    this._floors.set([]);
    this._desks.set([]);
    this._floorsLoading.set(false);
    this._desksLoading.set(false);
    this._optionsError.set(null);
    this._loadError.set(null);
    this._loading.set(true);
    try {
      const [user, buildings] = await Promise.all([
        firstValueFrom(this.authClient.me()),
        firstValueFrom(this.buildingsClient.list()),
      ]);
      const preferences = user.preferences;

      // Saved values count only while they still exist and fit together, so the pickers never
      // hide a value that a later save would send back. A 404 means it was deleted meanwhile;
      // any other failure aborts the load, because dropping the value would erase it on save.
      let building = buildings.find((b) => b.id === preferences?.defaultBuildingId);
      const floors = building ? await orGone(this.floorsClient.list(building.id)) : null;
      if (!floors) building = undefined;

      let floor = floors?.find((f) => f.id === preferences?.defaultFloorId);
      const desks = floor ? await orGone(this.resourcesClient.list(floor.id, { type: 'DESK' })) : null;
      if (!desks) floor = undefined;

      const desk = floor ? desks?.find((d) => d.id === preferences?.favoriteDeskId) : undefined;
      if (run !== this.loadRun) return;
      this._buildings.set(buildings);
      this._floors.set(building ? (floors ?? []) : []);
      this._desks.set(floor ? (desks ?? []) : []);
      this._loaded.set({
        user,
        selection: { building: building?.id ?? '', floor: floor?.id ?? '', desk: desk?.id ?? '' },
        preferencesLost:
          (!!preferences?.defaultBuildingId && !building) ||
          (!!preferences?.defaultFloorId && !floor) ||
          (!!preferences?.favoriteDeskId && !desk),
      });
    } catch (error) {
      if (run === this.loadRun) this._loadError.set(describe(error));
    } finally {
      if (run === this.loadRun) this._loading.set(false);
    }
  }

  /** Loads the floors of a building for the floor picker; empty `buildingId` just clears it. */
  async selectBuilding(buildingId: string): Promise<OptionsResult> {
    const run = ++this.floorsRun;
    this.desksRun++;
    this._floors.set([]);
    this._desks.set([]);
    this._desksLoading.set(false);
    this._optionsError.set(null);
    this._floorsLoading.set(buildingId !== '');
    if (!buildingId) return 'ok';
    try {
      const floors = await firstValueFrom(this.floorsClient.list(buildingId));
      if (run === this.floorsRun) this._floors.set(floors);
      return 'ok';
    } catch (error) {
      if (isGone(error)) return 'gone';
      if (run === this.floorsRun) this._optionsError.set(describe(error));
      return 'failed';
    } finally {
      if (run === this.floorsRun) this._floorsLoading.set(false);
    }
  }

  /** Loads the desks of a floor for the desk picker; empty `floorId` just clears it. */
  async selectFloor(floorId: string): Promise<OptionsResult> {
    const run = ++this.desksRun;
    this._desks.set([]);
    this._optionsError.set(null);
    this._desksLoading.set(floorId !== '');
    if (!floorId) return 'ok';
    try {
      const desks = await firstValueFrom(this.resourcesClient.list(floorId, { type: 'DESK' }));
      if (run === this.desksRun) this._desks.set(desks);
      return 'ok';
    } catch (error) {
      if (isGone(error)) return 'gone';
      if (run === this.desksRun) this._optionsError.set(describe(error));
      return 'failed';
    } finally {
      if (run === this.desksRun) this._desksLoading.set(false);
    }
  }

  /** Re-reads the building list, e.g. after one turned out to be deleted. Keeps the old list on failure. */
  async refreshBuildings(): Promise<void> {
    try {
      this._buildings.set(await firstValueFrom(this.buildingsClient.list()));
    } catch {
      // The pickers keep working with the list they have; the next page load fixes it.
    }
  }

  /** Resolves to null on success, otherwise to what went wrong. */
  async save(request: UpdateOwnProfileRequest, selection: Selection): Promise<SaveFailure | null> {
    try {
      const saved = await firstValueFrom(this.authClient.updateOwnProfile(request));
      this._loaded.set({ user: saved, selection, preferencesLost: false });
      this.auth.updateUser(saved);
      return null;
    } catch (error) {
      return { message: describe(error), fieldErrors: fieldErrorsOf(error) };
    }
  }
}

function isGone(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}

/** The answer, or null when the server says the thing is gone (404). */
async function orGone<T>(request: Observable<T>): Promise<T | null> {
  try {
    return await firstValueFrom(request);
  } catch (error) {
    if (isGone(error)) return null;
    throw error;
  }
}

function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!(error instanceof HttpErrorResponse)) return {};
  const errors = (error.error as { errors?: Record<string, string> } | null)?.errors ?? {};
  return Object.fromEntries(
    Object.entries(errors).map(([field, message]) => [field.replace(/^preferences\./, ''), message]),
  );
}

function describe(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { code?: string } | null)?.code;
    switch (code) {
      case 'VALIDATION_FAILED':
        return $localize`:@@profile.err.validation:Please check your input.`;
      case 'CONCURRENT_MODIFICATION':
        return $localize`:@@profile.err.concurrent:Your profile was changed elsewhere. Reload the page and try again.`;
      case 'USER_NOT_FOUND':
        return $localize`:@@profile.err.notFound:This account no longer exists.`;
    }
    if (error.status === 0) return $localize`:@@profile.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@profile.err.generic:Something went wrong. Please try again.`;
}
