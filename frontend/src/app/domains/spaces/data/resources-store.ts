import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EquipmentClient } from '@app/spaces/data/equipment-client';
import { ResourcesClient } from '@app/spaces/data/resources-client';
import { Equipment, Resource, ResourceInput, ResourceType } from '@app/spaces/models/resource';

@Injectable()
export class ResourcesStore {
  private readonly resourcesClient = inject(ResourcesClient);
  private readonly equipmentClient = inject(EquipmentClient);

  readonly items = signal<Resource[]>([]);
  readonly equipmentCatalogue = signal<Equipment[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);

  readonly typeFilter = signal<ResourceType | null>(null);
  readonly equipmentFilter = signal<string | null>(null);

  async load(floorId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [resources, equipment] = await Promise.all([
        firstValueFrom(
          this.resourcesClient.list(floorId, {
            type: this.typeFilter(),
            equipmentId: this.equipmentFilter(),
          })
        ),
        this.equipmentCatalogue().length === 0
          ? firstValueFrom(this.equipmentClient.list()).catch(() => [])
          : Promise.resolve(this.equipmentCatalogue()),
      ]);
      this.items.set(resources);
      if (equipment.length > 0) {
        this.equipmentCatalogue.set(equipment);
      }
    } catch {
      this.loadError.set($localize`:@@resourcesStore.loadFailed:Could not load resources.`);
    } finally {
      this.loading.set(false);
    }
  }

  async setTypeFilter(floorId: string, type: ResourceType | null): Promise<void> {
    this.typeFilter.set(type);
    await this.load(floorId);
  }

  async setEquipmentFilter(floorId: string, equipmentId: string | null): Promise<void> {
    this.equipmentFilter.set(equipmentId);
    await this.load(floorId);
  }

  async create(floorId: string, input: ResourceInput): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const created = await firstValueFrom(this.resourcesClient.create(floorId, input));
      this.items.update((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
      return true;
    } catch (err) {
      this.saveError.set(this.formatSaveError(err));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async update(floorId: string, resourceId: string, input: ResourceInput): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const updated = await firstValueFrom(this.resourcesClient.update(floorId, resourceId, input));
      this.items.update((list) =>
        list.map((r) => (r.id === resourceId ? updated : r)).sort((a, b) => a.name.localeCompare(b.name))
      );
      return true;
    } catch (err) {
      this.saveError.set(this.formatSaveError(err));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async remove(floorId: string, resourceId: string): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await firstValueFrom(this.resourcesClient.delete(floorId, resourceId));
      this.items.update((list) => list.filter((r) => r.id !== resourceId));
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.saveError.set(
          $localize`:@@resourcesStore.hasFutureBookings:This resource has future bookings and cannot be deleted.`
        );
      } else {
        this.saveError.set($localize`:@@resourcesStore.deleteFailed:Could not delete resource.`);
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async addEquipmentType(name: string): Promise<Equipment | null> {
    try {
      const created = await firstValueFrom(this.equipmentClient.create(name));
      this.equipmentCatalogue.update((list) =>
        [...list, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      return created;
    } catch {
      return null;
    }
  }

  clearSaveError(): void {
    this.saveError.set(null);
  }

  private formatSaveError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) {
        return $localize`:@@resourcesStore.nameConflict:A resource with this label already exists on this floor.`;
      }
      if (err.status === 400) {
        return $localize`:@@resourcesStore.invalidCapacity:Capacity must be at least 1 for meeting rooms, and exactly 1 for desks.`;
      }
    }
    return $localize`:@@resourcesStore.saveFailed:Could not save resource.`;
  }
}
