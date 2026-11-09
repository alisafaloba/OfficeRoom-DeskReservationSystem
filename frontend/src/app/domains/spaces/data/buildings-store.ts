import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Building, BuildingInput } from '@app/spaces/models/building';
import { BuildingsClient } from './buildings-client';

type Status = 'idle' | 'loading' | 'saving';

/**
 * Signal store for the building list and its CRUD operations. The list is unpaged (a company
 * has a handful of buildings) and the server stays the source of truth: every successful
 * write reloads it instead of patching local state.
 */
@Injectable({ providedIn: 'root' })
export class BuildingsStore {
  private readonly client = inject(BuildingsClient);

  private readonly _items = signal<readonly Building[]>([]);
  private readonly _status = signal<Status>('idle');
  private readonly _loadError = signal<string | null>(null);
  private readonly _saveError = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly loadError = this._loadError.asReadonly();
  readonly saveError = this._saveError.asReadonly();

  readonly loading = computed(() => this._status() === 'loading');
  readonly saving = computed(() => this._status() === 'saving');

  async load(): Promise<void> {
    this._status.set('loading');
    this._loadError.set(null);
    try {
      this._items.set(await firstValueFrom(this.client.list()));
    } catch (error) {
      this._loadError.set(describe(error));
    } finally {
      this._status.set('idle');
    }
  }

  /** Each write resolves to `true` on success so the caller can close its dialog. */
  create(input: BuildingInput): Promise<boolean> {
    return this.write(() => this.client.create(input));
  }

  update(id: string, input: BuildingInput): Promise<boolean> {
    return this.write(() => this.client.update(id, input));
  }

  remove(id: string): Promise<boolean> {
    return this.write(() => this.client.delete(id));
  }

  clearSaveError(): void {
    this._saveError.set(null);
  }

  private async write(action: () => Observable<unknown>): Promise<boolean> {
    this._status.set('saving');
    this._saveError.set(null);
    try {
      await firstValueFrom(action());
    } catch (error) {
      this._saveError.set(describe(error));
      this._status.set('idle');
      return false;
    }
    await this.load();
    return true;
  }
}

function describe(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { code?: string } | null)?.code;
    switch (code) {
      case 'BUILDING_NAME_ALREADY_IN_USE':
        return $localize`:@@buildings.err.nameInUse:A building with this name already exists.`;
      case 'BUILDING_NOT_FOUND':
        return $localize`:@@buildings.err.notFound:This building no longer exists.`;
      case 'VALIDATION_FAILED':
        return $localize`:@@buildings.err.validation:Please check your input.`;
      case 'FORBIDDEN':
        return $localize`:@@buildings.err.forbidden:You are not allowed to do this.`;
      case 'CONCURRENT_MODIFICATION':
        return $localize`:@@buildings.err.concurrent:The building was changed by someone else. Reload and try again.`;
    }
    if (error.status === 0) return $localize`:@@buildings.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@buildings.err.generic:Something went wrong. Please try again.`;
}
