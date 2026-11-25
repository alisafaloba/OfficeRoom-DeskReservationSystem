import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { SelectedBinding } from '@app/spaces/data/floor-plan-editor-store';
import { RESOURCE_TYPE_NAMES } from '@app/spaces/ui/resource-type-names';

/** What the admin typed to create a resource for the selected shape. */
export interface NewResourceDraft {
  readonly name: string;
  /** Only for meeting rooms. */
  readonly capacity: number | null;
}

/** Meeting rooms need a capacity; this is the starting value in the form. */
const DEFAULT_ROOM_CAPACITY = 4;

/**
 * The resource side of the selected desk or room: which resource it stands for, a list of free
 * resources of the same type to pick from, and a short form to create a new one bound to it.
 */
@Component({
  selector: 'app-resource-binding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resource-binding.html',
})
export class ResourceBinding {
  readonly binding = input.required<SelectedBinding>();
  /** A create request is on its way. */
  readonly busy = input(false);
  /** Why the last create failed, if it did. */
  readonly error = input<string | null>(null);

  /** A resource id to bind, or null to unbind. */
  readonly bound = output<string | null>();
  readonly createRequested = output<NewResourceDraft>();

  protected readonly creating = signal(false);
  protected readonly defaultCapacity = DEFAULT_ROOM_CAPACITY;
  protected readonly typeName = computed(() => RESOURCE_TYPE_NAMES[this.binding().resourceType]);
  protected readonly needsCapacity = computed(() => this.binding().resourceType === 'MEETING_ROOM');

  protected choose(select: HTMLSelectElement): void {
    if (select.value !== '') this.bound.emit(select.value);
  }

  protected openForm(): void {
    this.creating.set(true);
  }

  protected closeForm(): void {
    this.creating.set(false);
  }

  protected create(form: HTMLFormElement): void {
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    const capacity = form.querySelector<HTMLInputElement>('input[name="capacity"]');
    const trimmed = name.value.trim();
    if (trimmed === '') {
      name.focus();
      return;
    }
    const seats = capacity ? Math.floor(Number(capacity.value)) : null;
    if (capacity && (!Number.isFinite(seats) || seats === null || seats < 1)) {
      capacity.focus();
      return;
    }
    this.createRequested.emit({ name: trimmed, capacity: seats });
  }
}
