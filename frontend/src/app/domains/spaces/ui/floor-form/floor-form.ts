import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  required,
  schema,
  submit,
  validate,
} from '@angular/forms/signals';
import { Floor, FloorInput, MAX_FLOOR_NUMBER, MIN_FLOOR_NUMBER } from '@app/spaces/models/floor';

interface FloorFormModel {
  name: string;
  /** `null` while the number box is empty. */
  number: number | null;
}

/** Modal dialog to add (`floor` is null) or edit a floor. Emits the input; the parent saves. */
@Component({
  selector: 'app-floor-form',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './floor-form.html',
})
export class FloorForm {
  readonly floor = input<Floor | null>(null);
  /** Prefilled for a new floor: one above the highest existing number. */
  readonly suggestedNumber = input(0);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<FloorInput>();
  readonly closed = output<void>();

  protected readonly minNumber = MIN_FLOOR_NUMBER;
  protected readonly maxNumber = MAX_FLOOR_NUMBER;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly isCreate = computed(() => this.floor() === null);

  protected readonly model = linkedSignal<FloorFormModel>(() => ({
    name: this.floor()?.name ?? '',
    number: this.floor()?.number ?? this.suggestedNumber(),
  }));

  protected readonly form = form(
    this.model,
    schema<FloorFormModel>((path) => {
      required(path.name);
      maxLength(path.name, 100);
      required(path.number);
      min(path.number, MIN_FLOOR_NUMBER);
      max(path.number, MAX_FLOOR_NUMBER);
      validate(path.number, ({ value }) => {
        const n = value();
        return n === null || Number.isInteger(n) ? undefined : { kind: 'integer' };
      });
      // Whether the number is free in this building is the backend's call (409).
    }),
  );

  constructor() {
    // Native modal: focus trap, Escape and backdrop come from the browser.
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  protected async save(): Promise<void> {
    await submit(this.form, async () => {
      const { name, number } = this.model();
      if (number === null) return;
      this.submitted.emit({ name: name.trim(), number });
    });
  }
}
