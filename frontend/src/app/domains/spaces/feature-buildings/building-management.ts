import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ConfirmDialog } from '@app/admin/ui/confirm-dialog/confirm-dialog';
import { BuildingsStore } from '@app/spaces/data/buildings-store';
import { Building, BuildingInput } from '@app/spaces/models/building';
import { BuildingForm } from '@app/spaces/ui/building-form/building-form';

/** Admin page: list, create, edit and delete buildings. Only reachable through adminGuard. */
@Component({
  selector: 'app-building-management',
  imports: [BuildingForm, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './building-management.html',
})
export class BuildingManagement implements OnInit {
  protected readonly store = inject(BuildingsStore);

  protected readonly editing = signal<Building | 'new' | null>(null);
  protected readonly deleting = signal<Building | null>(null);

  protected readonly deleteHeading = $localize`:@@buildingManagement.deleteTitle:Delete building?`;
  protected readonly deleteLabel = $localize`:@@buildingManagement.confirmDelete:Delete`;
  protected readonly cancelLabel = $localize`:@@buildingForm.cancel:Cancel`;

  ngOnInit(): void {
    void this.store.load();
  }

  protected openCreate(): void {
    this.store.clearSaveError();
    this.editing.set('new');
  }

  protected openEdit(target: Building): void {
    this.store.clearSaveError();
    this.editing.set(target);
  }

  protected openDelete(target: Building): void {
    this.store.clearSaveError();
    this.deleting.set(target);
  }

  protected closeDialogs(): void {
    this.editing.set(null);
    this.deleting.set(null);
  }

  protected editTarget(): Building | null {
    const target = this.editing();
    return target === 'new' ? null : target;
  }

  protected async save(input: BuildingInput): Promise<void> {
    const target = this.editing();
    if (target === null) return;
    const ok =
      target === 'new'
        ? await this.store.create(input)
        : await this.store.update(target.id, input);
    if (ok) this.editing.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (target === null) return;
    if (await this.store.remove(target.id)) this.deleting.set(null);
  }
}
