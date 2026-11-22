import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  min,
  required,
  schema,
  submit,
  validate,
} from '@angular/forms/signals';
import {
  Equipment,
  Resource,
  ResourceInput,
  ResourceType,
  RESOURCE_TYPE_LABELS,
} from '@app/spaces/models/resource';

interface ResourceFormModel {
  name: string;
  type: ResourceType;
  capacity: number | null;
  notes: string;
}

@Component({
  selector: 'app-resource-form',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resource-form.html',
})
export class ResourceForm {
  readonly resource = input<Resource | null>(null);
  readonly equipmentCatalogue = input<Equipment[]>([]);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<ResourceInput>();
  readonly closed = output<void>();
  readonly addEquipment = output<string>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly isCreate = computed(() => this.resource() === null);
  protected readonly typeOptions: ResourceType[] = ['DESK', 'MEETING_ROOM', 'PHONE_BOOTH', 'PARKING_SPOT', 'BREAK_ROOM'];
  protected readonly typeLabels = RESOURCE_TYPE_LABELS;

  protected readonly newEquipmentName = signal('');
  protected readonly selectedEquipment = linkedSignal<string[]>(() =>
    this.resource()?.equipment?.map((e) => e.id) ?? []
  );

  protected readonly model = linkedSignal<ResourceFormModel>(() => ({
    name: this.resource()?.name ?? '',
    type: this.resource()?.type ?? 'DESK',
    capacity: this.resource()?.type === 'DESK' ? 1 : (this.resource()?.capacity ?? 4),
    notes: this.resource()?.notes ?? '',
  }));

  protected readonly form = form(
    this.model,
    schema<ResourceFormModel>((path) => {
      required(path.name);
      maxLength(path.name, 100);
      required(path.type);
      validate(path.capacity, ({ value, valueOf }) => {
        const type = valueOf(path.type);
        const cap = value();
        if (type === 'MEETING_ROOM') {
          if (cap === null || cap < 1) return { kind: 'min_capacity' };
        }
        return undefined;
      });
    })
  );

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  protected onTypeChange(type: ResourceType): void {
    this.model.update((m) => ({
      ...m,
      type,
      capacity: type === 'DESK' ? 1 : m.capacity && m.capacity > 0 ? m.capacity : 4,
    }));
  }

  protected toggleEquipment(id: string): void {
    this.selectedEquipment.update((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  protected addNewEquipment(): void {
    const name = this.newEquipmentName().trim();
    if (name) {
      this.addEquipment.emit(name);
      this.newEquipmentName.set('');
    }
  }

  protected async save(): Promise<void> {
    await submit(this.form, async () => {
      const { name, type, capacity, notes } = this.model();
      this.submitted.emit({
        name: name.trim(),
        type,
        capacity: type === 'DESK' ? 1 : capacity,
        notes: notes.trim() || null,
        equipmentIds: this.selectedEquipment(),
      });
    });
  }
}
