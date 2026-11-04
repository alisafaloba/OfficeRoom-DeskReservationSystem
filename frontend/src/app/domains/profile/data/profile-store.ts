import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AuthClient } from '@app/shared/auth/data/auth-client';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { UpdateOwnProfileRequest, User } from '@app/shared/auth/models/auth';
import { Building } from '@app/profile/models/space';
import { SpaceClient } from './space-client';

export interface SaveFailure {
  /** Always set, for failures that cannot be shown next to a field. */
  readonly message: string;
  /** Server messages keyed by field, with the `preferences.` prefix removed. */
  readonly fieldErrors: Readonly<Record<string, string>>;
}

/** The signed-in user's profile plus the options for the preference pickers. */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly client = inject(AuthClient);
  private readonly auth = inject(AuthStore);
  private readonly spaces = inject(SpaceClient);

  private readonly _profile = signal<User | null>(null);
  private readonly _buildings = signal<readonly Building[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly buildings = this._buildings.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadError = this._loadError.asReadonly();

  async load(): Promise<void> {
    // The store outlives a logout: never show the previous user's data while loading.
    this._profile.set(null);
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const { profile, buildings } = await firstValueFrom(
        forkJoin({ profile: this.client.me(), buildings: this.spaces.catalog() }),
      );
      this._buildings.set(buildings);
      this._profile.set(profile);
    } catch (error) {
      this._loadError.set(describe(error));
    } finally {
      this._loading.set(false);
    }
  }

  /** Resolves to null on success, otherwise to what went wrong. */
  async save(request: UpdateOwnProfileRequest): Promise<SaveFailure | null> {
    try {
      const saved = await firstValueFrom(this.client.updateOwnProfile(request));
      this._profile.set(saved);
      this.auth.updateUser(saved);
      return null;
    } catch (error) {
      return { message: describe(error), fieldErrors: fieldErrorsOf(error) };
    }
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
