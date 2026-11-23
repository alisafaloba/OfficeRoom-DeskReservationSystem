import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EquipmentClient } from '@app/spaces/data/equipment-client';
import { ResourcesClient } from '@app/spaces/data/resources-client';
import {
  Equipment,
  Resource,
  ResourceInput,
  ResourceStatusInput,
  ResourceType,
} from '@app/spaces/models/resource';

type Status = 'idle' | 'loading' | 'saving';

@Injectable()
export class ResourcesStore {
  private readonly resourcesClient = inject(ResourcesClient);
  private readonly equipmentClient = inject(EquipmentClient);

  private readonly _items = signal<Resource[]>([]);
  private readonly _equipmentCatalogue = signal<Equipment[]>([]);
  private readonly _status = signal<Status>('idle');
  private readonly _loadError = signal<string | null>(null);
  private readonly _saveError = signal<string | null>(null);
  private readonly _equipmentError = signal<string | null>(null);

  private readonly _typeFilter = signal<ResourceType | null>(null);
  private readonly _equipmentFilter = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly equipmentCatalogue = this._equipmentCatalogue.asReadonly();
  readonly loadError = this._loadError.asReadonly();
  readonly saveError = this._saveError.asReadonly();
  readonly equipmentError = this._equipmentError.asReadonly();
  readonly typeFilter = this._typeFilter.asReadonly();
  readonly equipmentFilter = this._equipmentFilter.asReadonly();

  readonly loading = computed(() => this._status() === 'loading');
  readonly saving = computed(() => this._status() === 'saving');

  async load(floorId: string): Promise<void> {
    this._status.set('loading');
    this._loadError.set(null);
    try {
      const [resources, equipment] = await Promise.all([
        firstValueFrom(
          this.resourcesClient.list(floorId, {
            type: this._typeFilter(),
            equipmentId: this._equipmentFilter(),
          })
        ),
        this._equipmentCatalogue().length === 0
          ? firstValueFrom(this.equipmentClient.list()).catch(() => [])
          : Promise.resolve(this._equipmentCatalogue()),
      ]);
      this._items.set(resources);
      if (equipment.length > 0) {
        this._equipmentCatalogue.set(equipment);
      }
    } catch (error) {
      this._loadError.set(describe(error));
    } finally {
      this._status.set('idle');
    }
  }

  async setTypeFilter(floorId: string, type: ResourceType | null): Promise<void> {
    this._typeFilter.set(type);
    await this.load(floorId);
  }

  async setEquipmentFilter(floorId: string, equipmentId: string | null): Promise<void> {
    this._equipmentFilter.set(equipmentId);
    await this.load(floorId);
  }

  async create(floorId: string, input: ResourceInput): Promise<boolean> {
    this._status.set('saving');
    this._saveError.set(null);
    try {
      const created = await firstValueFrom(this.resourcesClient.create(floorId, input));
      const matchesType = !this._typeFilter() || created.type === this._typeFilter();
      const matchesEq =
        !this._equipmentFilter() ||
        created.equipment.some((e) => e.id === this._equipmentFilter());
      if (matchesType && matchesEq) {
        this._items.update((list) =>
          [...list, created].sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      return true;
    } catch (err) {
      this._saveError.set(describe(err));
      return false;
    } finally {
      this._status.set('idle');
    }
  }

  async update(floorId: string, resourceId: string, input: ResourceInput): Promise<boolean> {
    this._status.set('saving');
    this._saveError.set(null);
    try {
      const updated = await firstValueFrom(this.resourcesClient.update(floorId, resourceId, input));
      this._items.update((list) =>
        list.map((r) => (r.id === resourceId ? updated : r)).sort((a, b) => a.name.localeCompare(b.name))
      );
      return true;
    } catch (err) {
      this._saveError.set(describe(err));
      return false;
    } finally {
      this._status.set('idle');
    }
  }

  async changeStatus(
    floorId: string,
    resourceId: string,
    input: ResourceStatusInput
  ): Promise<boolean> {
    this._status.set('saving');
    this._saveError.set(null);
    try {
      const updated = await firstValueFrom(
        this.resourcesClient.changeStatus(floorId, resourceId, input)
      );
      this._items.update((list) =>
        list.map((r) => (r.id === resourceId ? updated : r))
      );
      return true;
    } catch (err) {
      this._saveError.set(describe(err));
      return false;
    } finally {
      this._status.set('idle');
    }
  }

  async remove(floorId: string, resourceId: string): Promise<boolean> {
    this._status.set('saving');
    this._saveError.set(null);
    try {
      await firstValueFrom(this.resourcesClient.delete(floorId, resourceId));
      this._items.update((list) => list.filter((r) => r.id !== resourceId));
      return true;
    } catch (err) {
      this._saveError.set(describe(err));
      return false;
    } finally {
      this._status.set('idle');
    }
  }

  async addEquipmentType(name: string): Promise<Equipment | null> {
    this._equipmentError.set(null);
    try {
      const created = await firstValueFrom(this.equipmentClient.create(name));
      this._equipmentCatalogue.update((list) =>
        [...list, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      return created;
    } catch (err) {
      this._equipmentError.set(describe(err));
      return null;
    }
  }

  clearSaveError(): void {
    this._saveError.set(null);
  }

  clearEquipmentError(): void {
    this._equipmentError.set(null);
  }
}

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { code?: string } | null)?.code
    : undefined;
}

function describe(error: unknown): string {
  switch (codeOf(error)) {
    case 'RESOURCE_NAME_ALREADY_IN_USE':
      return $localize`:@@resources.err.nameInUse:This floor already has a resource with this name.`;
    case 'INVALID_RESOURCE_CAPACITY':
      return $localize`:@@resources.err.invalidCapacity:Capacity must be at least 1 for meeting rooms, and exactly 1 for desks.`;
    case 'RESOURCE_HAS_FUTURE_BOOKINGS':
      return $localize`:@@resources.err.hasFutureBookings:This resource has future bookings and cannot be deleted.`;
    case 'RESOURCE_UNAVAILABLE':
      return $localize`:@@resources.err.unavailable:This resource is currently unavailable.`;
    case 'RESOURCE_NOT_FOUND':
      return $localize`:@@resources.err.notFound:This resource no longer exists.`;
    case 'EQUIPMENT_NAME_ALREADY_IN_USE':
      return $localize`:@@resources.err.equipmentNameInUse:An equipment type with this name already exists.`;
    case 'EQUIPMENT_NOT_FOUND':
      return $localize`:@@resources.err.equipmentNotFound:One or more equipment items were not found.`;
    case 'FLOOR_NOT_FOUND':
      return $localize`:@@resources.err.floorNotFound:This floor no longer exists.`;
    case 'VALIDATION_FAILED':
      return $localize`:@@resources.err.validation:Please check your input.`;
    case 'FORBIDDEN':
      return $localize`:@@resources.err.forbidden:You are not allowed to do this.`;
  }
  if (error instanceof HttpErrorResponse && error.status === 409) {
    return $localize`:@@resources.err.conflict:A conflict occurred. Please reload and try again.`;
  }
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return $localize`:@@resources.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@resources.err.generic:Something went wrong. Please try again.`;
}
