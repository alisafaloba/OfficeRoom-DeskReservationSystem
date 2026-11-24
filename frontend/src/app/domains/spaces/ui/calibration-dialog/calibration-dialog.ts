import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';

/**
 * Native modal asking for the real distance between the two points picked on the background,
 * in metres (how plans are dimensioned). Emits it in centimetres, the plan unit.
 */
@Component({
  selector: 'app-calibration-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calibration-dialog.html',
})
export class CalibrationDialog {
  /** The distance between the points at the current scale, in cm, shown as a starting point. */
  readonly measuredCm = input.required<number>();

  readonly confirmed = output<number>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly invalid = signal(false);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  protected measuredMetres(): string {
    return (this.measuredCm() / 100).toFixed(2);
  }

  protected save(input: HTMLInputElement): void {
    // Accepts a decimal comma too, as German keyboards type it.
    const metres = Number(input.value.trim().replace(',', '.'));
    if (input.value.trim() === '' || !Number.isFinite(metres) || metres <= 0) {
      this.invalid.set(true);
      input.focus();
      return;
    }
    this.invalid.set(false);
    this.confirmed.emit(metres * 100);
  }
}
