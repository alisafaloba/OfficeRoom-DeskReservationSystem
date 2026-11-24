import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfirmDialog } from '@app/admin/ui/confirm-dialog/confirm-dialog';
import { ResourcesStore } from '@app/spaces/data/resources-store';
import {
  Resource,
  ResourceInput,
  ResourceStatus,
  ResourceStatusInput,
  ResourceType,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
} from '@app/spaces/models/resource';
import { ChangeStatusDialog } from '@app/spaces/ui/change-status-dialog/change-status-dialog';
import { ResourceForm } from '@app/spaces/ui/resource-form/resource-form';

@Component({
  selector: 'app-resource-management',
  imports: [ChangeStatusDialog, ConfirmDialog, ResourceForm, RouterLink],
  providers: [ResourcesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resource-management.html',
})
export class ResourceManagement {
  readonly buildingId = input.required<string>();
  readonly floorId = input.required<string>();

  protected readonly store = inject(ResourcesStore);

  protected readonly editing = signal<Resource | 'new' | null>(null);
  protected readonly deleting = signal<Resource | null>(null);
  protected readonly changingStatus = signal<Resource | null>(null);

  protected readonly typeOptions: (ResourceType | 'ALL')[] = [
    'ALL',
    ...RESOURCE_TYPES,
  ];
  protected readonly typeLabels = RESOURCE_TYPE_LABELS;
  protected readonly statusLabels = RESOURCE_STATUS_LABELS;

  protected readonly deleteHeading = $localize`:@@resourceManagement.deleteTitle:Delete resource?`;
  protected readonly deleteLabel = $localize`:@@resourceManagement.confirmDelete:Delete`;
  protected readonly cancelLabel = $localize`:@@resourceForm.cancel:Cancel`;

  constructor() {
    effect(() => {
      const floorId = this.floorId();
      untracked(() => void this.store.load(floorId));
    });
  }

  protected reload(): void {
    void this.store.load(this.floorId());
  }

  protected onTypeFilterChange(val: string): void {
    const type = val === 'ALL' ? null : (val as ResourceType);
    void this.store.setTypeFilter(this.floorId(), type);
  }

  protected onEquipmentFilterChange(val: string): void {
    const eqId = val === 'ALL' ? null : val;
    void this.store.setEquipmentFilter(this.floorId(), eqId);
  }

  protected openCreate(): void {
    this.store.clearSaveError();
    this.editing.set('new');
  }

  protected openEdit(target: Resource): void {
    this.store.clearSaveError();
    this.editing.set(target);
  }

  protected openStatusDialog(target: Resource): void {
    this.store.clearSaveError();
    this.changingStatus.set(target);
  }

  protected openDelete(target: Resource): void {
    this.store.clearSaveError();
    this.deleting.set(target);
  }

  protected closeDialogs(): void {
    this.editing.set(null);
    this.deleting.set(null);
    this.changingStatus.set(null);
  }

  protected editTarget(): Resource | null {
    const target = this.editing();
    return target === 'new' ? null : target;
  }

  protected async save(input: ResourceInput): Promise<void> {
    const target = this.editing();
    if (target === null) return;
    const ok =
      target === 'new'
        ? await this.store.create(this.floorId(), input)
        : await this.store.update(this.floorId(), target.id, input);
    if (ok) this.editing.set(null);
  }

  protected async saveStatus(input: ResourceStatusInput): Promise<void> {
    const target = this.changingStatus();
    if (target === null) return;
    const ok = await this.store.changeStatus(this.floorId(), target.id, input);
    if (ok) this.changingStatus.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (target === null) return;
    if (await this.store.remove(this.floorId(), target.id)) {
      this.deleting.set(null);
    }
  }

  protected async addEquipmentType(name: string, form?: ResourceForm): Promise<void> {
    const created = await this.store.addEquipmentType(name);
    if (created && form) {
      form.autoSelectEquipment(created.id);
    }
  }
}
