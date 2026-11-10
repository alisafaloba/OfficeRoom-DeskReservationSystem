import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfirmDialog } from '@app/admin/ui/confirm-dialog/confirm-dialog';
import { FloorsStore } from '@app/spaces/data/floors-store';
import { Floor, FloorInput, MAX_FLOOR_NUMBER } from '@app/spaces/models/floor';
import { FloorForm } from '@app/spaces/ui/floor-form/floor-form';

/**
 * Admin page: the floors of one building in display order. Floors are added, edited and
 * removed here, and dragged (or moved with the arrow buttons) into a new order, which is saved
 * at once. Only reachable through adminGuard.
 */
@Component({
  selector: 'app-floor-management',
  imports: [ConfirmDialog, FloorForm, RouterLink],
  providers: [FloorsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './floor-management.html',
})
export class FloorManagement {
  /** From the route, `/spaces/buildings/:buildingId/floors`. */
  readonly buildingId = input.required<string>();

  protected readonly store = inject(FloorsStore);

  protected readonly editing = signal<Floor | 'new' | null>(null);
  protected readonly deleting = signal<Floor | null>(null);

  /** Index of the row being dragged, and of the row it currently hovers. */
  protected readonly dragFrom = signal<number | null>(null);
  protected readonly dragOver = signal<number | null>(null);

  protected readonly deleteHeading = $localize`:@@floorManagement.deleteTitle:Delete floor?`;
  protected readonly deleteLabel = $localize`:@@floorManagement.confirmDelete:Delete`;
  protected readonly cancelLabel = $localize`:@@floorForm.cancel:Cancel`;

  /** A new floor is offered the number above the highest one, the usual case when adding. */
  protected readonly suggestedNumber = computed(() => {
    const numbers = this.store.items().map((f) => f.number);
    return numbers.length === 0 ? 0 : Math.min(Math.max(...numbers) + 1, MAX_FLOOR_NUMBER);
  });

  constructor() {
    // Loads again when the route switches to another building.
    effect(() => {
      const buildingId = this.buildingId();
      untracked(() => void this.store.load(buildingId));
    });
  }

  protected reload(): void {
    void this.store.load(this.buildingId());
  }

  protected openCreate(): void {
    this.store.clearSaveError();
    this.editing.set('new');
  }

  protected openEdit(target: Floor): void {
    this.store.clearSaveError();
    this.editing.set(target);
  }

  protected openDelete(target: Floor): void {
    this.store.clearSaveError();
    this.deleting.set(target);
  }

  protected closeDialogs(): void {
    this.editing.set(null);
    this.deleting.set(null);
  }

  protected editTarget(): Floor | null {
    const target = this.editing();
    return target === 'new' ? null : target;
  }

  protected async save(input: FloorInput): Promise<void> {
    const target = this.editing();
    if (target === null) return;
    const ok =
      target === 'new' ? await this.store.create(input) : await this.store.update(target.id, input);
    if (ok) this.editing.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (target === null) return;
    if (await this.store.remove(target.id)) this.deleting.set(null);
  }

  /** The keyboard alternative to dragging: one step up or down. */
  protected moveBy(index: number, step: -1 | 1): void {
    void this.store.move(index, index + step);
  }

  protected moveUpLabel(floor: Floor): string {
    return $localize`:@@floorManagement.moveUp:Move ${floor.name}:name: up`;
  }

  protected moveDownLabel(floor: Floor): string {
    return $localize`:@@floorManagement.moveDown:Move ${floor.name}:name: down`;
  }

  // --- drag and drop (native HTML5) ---

  protected onDragStart(index: number, event: DragEvent): void {
    if (this.store.saving()) {
      event.preventDefault();
      return;
    }
    this.dragFrom.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // Firefox only starts a drag that carries data.
      event.dataTransfer.setData('text/plain', this.store.items()[index]?.id ?? '');
    }
  }

  protected onDragOver(index: number, event: DragEvent): void {
    if (this.dragFrom() === null) return;
    event.preventDefault(); // marks the row as a drop target
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOver.set(index);
  }

  protected onDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragFrom();
    this.onDragEnd();
    if (from !== null && from !== index) void this.store.move(from, index);
  }

  protected onDragEnd(): void {
    this.dragFrom.set(null);
    this.dragOver.set(null);
  }
}
