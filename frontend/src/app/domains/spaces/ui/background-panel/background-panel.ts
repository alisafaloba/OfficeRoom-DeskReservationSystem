import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FloorBackground } from '@app/spaces/models/floor-background';

/** Upload, opacity, scale and removal of the floor's background image. Holds no data itself. */
@Component({
  selector: 'app-background-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './background-panel.html',
})
export class BackgroundPanel {
  readonly background = input<FloorBackground | null>(null);
  /** Live value while the slider moves, in percent. */
  readonly opacity = input(50);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly fileChosen = output<File>();
  readonly opacityPreviewed = output<number>();
  readonly opacityCommitted = output<number>();
  readonly scaleCommitted = output<number>();
  readonly removed = output<void>();

  /** Remove asks once more, in place: the stored file is gone for good. */
  protected readonly confirmingRemove = signal(false);

  protected pick(input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Cleared so choosing the same file again still fires `change`.
    input.value = '';
    if (file) this.fileChosen.emit(file);
  }

  protected commitScale(input: HTMLInputElement, saved: number): void {
    const value = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(value) || value <= 0) {
      input.value = String(saved);
      return;
    }
    this.scaleCommitted.emit(value);
  }

  protected confirmRemove(): void {
    this.confirmingRemove.set(false);
    this.removed.emit();
  }

  protected sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
