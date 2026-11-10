import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { form, FormField, maxLength, required, schema, submit } from '@angular/forms/signals';

interface RoomLabelModel {
  label: string;
}

/** Native modal asking for the label of a room or break room that was just drawn. */
@Component({
  selector: 'app-room-label-dialog',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './room-label-dialog.html',
})
export class RoomLabelDialog {
  /** Dialog title shown to the user; defaults to "Name the room". */
  readonly title = input($localize`:@@roomLabel.title:Name the room`);
  /** Label for the save button; defaults to "Add room". */
  readonly saveLabel = input($localize`:@@roomLabel.save:Add room`);

  readonly confirmed = output<string>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly model = signal<RoomLabelModel>({ label: '' });
  protected readonly form = form(
    this.model,
    schema<RoomLabelModel>((path) => {
      required(path.label);
      maxLength(path.label, 80);
    }),
  );

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  protected async save(): Promise<void> {
    await submit(this.form, async () => {
      const label = this.model().label.trim();
      if (label !== '') this.confirmed.emit(label);
    });
  }
}
