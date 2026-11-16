import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, forkJoin, Observable } from 'rxjs';
import { Building } from '@app/spaces/models/building';
import { Floor, FloorInput } from '@app/spaces/models/floor';
import { BuildingsClient } from './buildings-client';
import { FloorsClient } from './floors-client';

type Status = 'idle' | 'loading' | 'saving';

/**
 * Signal store for the floors of one building. Provided by the floors page, so each visit
 * starts clean. The server stays the source of truth: creates, edits and deletes reload the
 * list; a reorder shows the new order at once and then takes the server's answer.
 */
@Injectable()
export class FloorsStore {
  private readonly floorsClient = inject(FloorsClient);
  private readonly buildingsClient = inject(BuildingsClient);

  private buildingId: string | null = null;

  private readonly _building = signal<Building | null>(null);
  private readonly _items = signal<readonly Floor[]>([]);
  private readonly _status = signal<Status>('idle');
  private readonly _loadError = signal<string | null>(null);
  private readonly _saveError = signal<string | null>(null);
  private readonly _reorderError = signal<string | null>(null);

  readonly building = this._building.asReadonly();
  /** Always in display order. */
  readonly items = this._items.asReadonly();
  readonly loadError = this._loadError.asReadonly();
  /** For the open create, edit or delete dialog. */
  readonly saveError = this._saveError.asReadonly();
  /** For the list itself: a reorder has no dialog to show its error in. */
  readonly reorderError = this._reorderError.asReadonly();

  readonly loading = computed(() => this._status() === 'loading');
  readonly saving = computed(() => this._status() === 'saving');

  /** Loads the building (for its name) and its floors. */
  async load(buildingId: string): Promise<void> {
    this.buildingId = buildingId;
    this._status.set('loading');
    this._loadError.set(null);
    try {
      const { building, floors } = await firstValueFrom(
        forkJoin({
          building: this.buildingsClient.get(buildingId),
          floors: this.floorsClient.list(buildingId),
        }),
      );
      this._building.set(building);
      this._items.set(floors);
    } catch (error) {
      this._loadError.set(describe(error));
    } finally {
      this._status.set('idle');
    }
  }

  /** Each write resolves to `true` on success so the caller can close its dialog. */
  create(input: FloorInput): Promise<boolean> {
    return this.write((buildingId) => this.floorsClient.create(buildingId, input));
  }

  update(floorId: string, input: FloorInput): Promise<boolean> {
    return this.write((buildingId) => this.floorsClient.update(buildingId, floorId, input));
  }

  remove(floorId: string): Promise<boolean> {
    return this.write((buildingId) => this.floorsClient.delete(buildingId, floorId));
  }

  /** Moves the floor at `from` to `to` (both 0-based) and saves the whole new order. */
  move(from: number, to: number): Promise<boolean> {
    const current = this._items();
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) {
      return Promise.resolve(false);
    }
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return this.reorder(next);
  }

  clearSaveError(): void {
    this._saveError.set(null);
  }

  clearReorderError(): void {
    this._reorderError.set(null);
  }

  private async reorder(next: readonly Floor[]): Promise<boolean> {
    const buildingId = this.buildingId;
    if (buildingId === null) return false;
    const previous = this._items();
    this._items.set(next); // the dragged floor stays where it was dropped while the request runs
    this._status.set('saving');
    this._reorderError.set(null);
    try {
      this._items.set(
        await firstValueFrom(this.floorsClient.reorder(buildingId, next.map((f) => f.id))),
      );
      this._status.set('idle');
      return true;
    } catch (error) {
      this._items.set(previous);
      this._reorderError.set(describe(error));
      this._status.set('idle');
      // Someone else added or removed a floor: show the current list before the next try.
      if (codeOf(error) === 'FLOOR_ORDER_OUTDATED') await this.reloadFloors(buildingId);
      return false;
    }
  }

  private async write(action: (buildingId: string) => Observable<unknown>): Promise<boolean> {
    const buildingId = this.buildingId;
    if (buildingId === null) return false;
    this._status.set('saving');
    this._saveError.set(null);
    this._reorderError.set(null);
    try {
      await firstValueFrom(action(buildingId));
    } catch (error) {
      this._saveError.set(describe(error));
      this._status.set('idle');
      return false;
    }
    await this.reloadFloors(buildingId);
    return true;
  }

  private async reloadFloors(buildingId: string): Promise<void> {
    this._status.set('loading');
    try {
      this._items.set(await firstValueFrom(this.floorsClient.list(buildingId)));
    } catch (error) {
      this._loadError.set(describe(error));
    } finally {
      this._status.set('idle');
    }
  }
}

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { code?: string } | null)?.code
    : undefined;
}

function describe(error: unknown): string {
  switch (codeOf(error)) {
    case 'FLOOR_NUMBER_ALREADY_IN_USE':
      return $localize`:@@floors.err.numberInUse:This building already has a floor with this number.`;
    case 'FLOOR_NOT_FOUND':
      return $localize`:@@floors.err.notFound:This floor no longer exists.`;
    case 'BUILDING_NOT_FOUND':
      return $localize`:@@floors.err.buildingNotFound:This building no longer exists.`;
    case 'FLOOR_ORDER_OUTDATED':
      return $localize`:@@floors.err.orderOutdated:The floors were changed by someone else. The list has been reloaded; please try again.`;
    case 'VALIDATION_FAILED':
      return $localize`:@@floors.err.validation:Please check your input.`;
    case 'FORBIDDEN':
      return $localize`:@@floors.err.forbidden:You are not allowed to do this.`;
    case 'CONCURRENT_MODIFICATION':
      return $localize`:@@floors.err.concurrent:The floor was changed by someone else. Reload and try again.`;
  }
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return $localize`:@@floors.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@floors.err.generic:Something went wrong. Please try again.`;
}
