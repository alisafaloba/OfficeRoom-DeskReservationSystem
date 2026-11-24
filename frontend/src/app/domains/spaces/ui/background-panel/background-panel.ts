import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BackgroundMode, PdfChoice } from '@app/spaces/data/floor-background-store';
import {
  FloorBackground,
  isValidOffset,
  isValidScale,
  MAX_CM_PER_PIXEL,
  MIN_CM_PER_PIXEL,
} from '@app/spaces/models/floor-background';

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
  readonly mode = input<BackgroundMode>('idle');
  /** A multi-page PDF waiting for its page to be picked. */
  readonly pdfChoice = input<PdfChoice | null>(null);

  readonly fileChosen = output<File>();
  readonly pdfPageChosen = output<number>();
  readonly pdfChoiceCancelled = output<void>();
  readonly visibilityToggled = output<void>();
  /** 1 clockwise, -1 anticlockwise. */
  readonly rotated = output<1 | -1>();
  readonly calibrateRequested = output<void>();
  readonly moveToggled = output<void>();
  readonly positionCommitted = output<{ readonly x: number; readonly y: number }>();
  readonly opacityPreviewed = output<number>();
  readonly opacityCommitted = output<number>();
  readonly scaleCommitted = output<number>();
  readonly removed = output<void>();

  /** Remove asks once more, in place: the stored file is gone for good. */
  protected readonly confirmingRemove = signal(false);
  /** A scale refused here, before anything is sent. */
  protected readonly scaleError = signal<string | null>(null);

  /** A position refused here, before anything is sent. */
  protected readonly positionError = signal<string | null>(null);

  protected readonly minScale = MIN_CM_PER_PIXEL;
  protected readonly maxScale = MAX_CM_PER_PIXEL;

  private readonly injector = inject(Injector);
  private readonly removeButton = viewChild<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelRemoveButton');

  protected pick(input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Cleared so choosing the same file again still fires `change`.
    input.value = '';
    if (file) this.fileChosen.emit(file);
  }

  /** Only values the server accepts go out; anything else puts the saved scale back and says why. */
  protected commitScale(input: HTMLInputElement, saved: number): void {
    const value = Number(input.value);
    if (input.value.trim() === '' || !isValidScale(value)) {
      input.value = String(saved);
      this.scaleError.set(
        $localize`:@@background.err.scaleRange:Enter a scale between ${MIN_CM_PER_PIXEL}:min: and ${MAX_CM_PER_PIXEL}:max: cm per pixel.`,
      );
      return;
    }
    this.scaleError.set(null);
    this.scaleCommitted.emit(value);
  }

  /** Saves both coordinates; a value that is not a number within 1 km puts the saved one back. */
  protected commitPosition(xInput: HTMLInputElement, yInput: HTMLInputElement, saved: FloorBackground): void {
    const x = Number(xInput.value);
    const y = Number(yInput.value);
    const bad = (input: HTMLInputElement, value: number) => input.value.trim() === '' || !isValidOffset(value);
    if (bad(xInput, x) || bad(yInput, y)) {
      xInput.value = String(saved.offsetX);
      yInput.value = String(saved.offsetY);
      this.positionError.set(
        $localize`:@@background.err.positionRange:Enter a position within 100000 cm of the plan origin.`,
      );
      return;
    }
    this.positionError.set(null);
    if (x !== saved.offsetX || y !== saved.offsetY) this.positionCommitted.emit({ x, y });
  }

  protected pages(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  protected choosePage(select: HTMLSelectElement): void {
    this.pdfPageChosen.emit(Number(select.value));
  }

  /** The box replaces the focused button, so focus moves into it instead of falling to the page. */
  protected askRemove(): void {
    this.confirmingRemove.set(true);
    afterNextRender(() => this.cancelButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelRemove(): void {
    this.confirmingRemove.set(false);
    afterNextRender(() => this.removeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected confirmRemove(): void {
    this.confirmingRemove.set(false);
    this.removed.emit();
  }

  protected sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
