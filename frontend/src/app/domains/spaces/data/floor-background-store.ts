import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BackgroundLayer,
  FloorBackground,
  FloorBackgroundSettings,
  isValidScale,
  MAX_BACKGROUND_BYTES,
} from '@app/spaces/models/floor-background';
import { PdfRasterizer } from '@app/spaces/util/pdf-rasterizer';
import { FloorBackgroundClient } from './floor-background-client';

/**
 * The background image of the floor being edited: the architectural plan the admin draws over.
 * Provided by the editor page. The image is held as an object URL, released when the page goes.
 */
@Injectable()
export class FloorBackgroundStore {
  private readonly client = inject(FloorBackgroundClient);
  private readonly pdf = inject(PdfRasterizer);

  private floorId: string | null = null;
  /** Bumped by every load: an answer for a floor the editor has already left is dropped. */
  private loadRun = 0;
  private opacityTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _background = signal<FloorBackground | null>(null);
  private readonly _url = signal<string | null>(null);
  private readonly _pixels = signal<{ readonly width: number; readonly height: number } | null>(null);
  /** Shown while the slider moves; saved only when it is let go. */
  private readonly _opacity = signal(50);
  private readonly _busy = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly background = this._background.asReadonly();
  readonly opacity = this._opacity.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly error = this._error.asReadonly();

  /** The image sized in plan units, or null while there is none (or it is still loading). */
  readonly layer = computed<BackgroundLayer | null>(() => {
    const background = this._background();
    const url = this._url();
    const pixels = this._pixels();
    if (!background || !url || !pixels) return null;
    return {
      url,
      width: pixels.width * background.cmPerPixel,
      height: pixels.height * background.cmPerPixel,
      opacity: this._opacity() / 100,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancelPendingOpacity();
      this.setImage(null, null);
    });
  }

  /**
   * Shows the background of `floorId`. The previous floor's image goes at once, and answers that
   * arrive after the editor moved on to another floor are dropped, so they never show up there.
   */
  async load(floorId: string): Promise<void> {
    const run = ++this.loadRun;
    this.cancelPendingOpacity();
    this.floorId = floorId;
    this.clear();
    this._error.set(null);
    try {
      const background = await firstValueFrom(this.client.get(floorId));
      if (run !== this.loadRun) return;
      await this.show(floorId, background, undefined, run);
    } catch (error) {
      if (run !== this.loadRun) return;
      if (codeOf(error) === 'FLOOR_BACKGROUND_NOT_FOUND') {
        this.clear();
        return;
      }
      this._error.set(describe(error));
    }
  }

  /** PNG and JPEG go up as they are; a PDF is turned into an image of its first page first. */
  async upload(file: File): Promise<void> {
    const floorId = this.floorId;
    if (!floorId || this._busy()) return;
    this._error.set(null);
    const kind = kindOf(file);
    if (kind === null) {
      this._error.set($localize`:@@background.err.type:Choose a PNG, JPG or PDF file.`);
      return;
    }
    this._busy.set(true);
    try {
      let image: Blob = file;
      let name = file.name;
      if (kind === 'pdf') {
        image = await this.pdf.firstPage(file);
        name = `${file.name.replace(/\.pdf$/i, '')}.${image.type === 'image/jpeg' ? 'jpg' : 'png'}`;
      }
      if (image.size > MAX_BACKGROUND_BYTES) {
        this._error.set(tooLarge());
        return;
      }
      const background = await firstValueFrom(this.client.upload(floorId, image, name));
      if (floorId !== this.floorId) return;
      await this.show(floorId, background, image);
    } catch (error) {
      if (floorId !== this.floorId) return;
      this._error.set(kind === 'pdf' && !(error instanceof HttpErrorResponse) ? unreadablePdf() : describe(error));
    } finally {
      this._busy.set(false);
    }
  }

  /** Live preview while the opacity slider moves; nothing is saved. */
  previewOpacity(percent: number): void {
    this._opacity.set(clamp(Math.round(percent), 0, 100));
  }

  /**
   * Shows the opacity at once and saves it once the slider rests. With the arrow keys every step
   * is a commit, so 50% → 80% would otherwise send 30 requests; only the last one is sent.
   */
  commitOpacity(percent: number): void {
    this.previewOpacity(percent);
    this.cancelPendingOpacity();
    this.opacityTimer = setTimeout(() => {
      this.opacityTimer = null;
      void this.saveSettings({ opacity: this._opacity() });
    }, OPACITY_SAVE_DELAY_MS);
  }

  /** Saves opacity and/or scale. A refused value puts the last saved one back. */
  async saveSettings(change: Partial<FloorBackgroundSettings>): Promise<void> {
    const floorId = this.floorId;
    const current = this._background();
    if (!floorId || !current) return;
    const settings: FloorBackgroundSettings = {
      opacity: clamp(Math.round(change.opacity ?? this._opacity()), 0, 100),
      cmPerPixel: change.cmPerPixel ?? current.cmPerPixel,
    };
    if (!isValidScale(settings.cmPerPixel)) {
      this._error.set(scaleOutOfRange());
      return;
    }
    this._error.set(null);
    this._opacity.set(settings.opacity);
    try {
      const saved = await firstValueFrom(this.client.updateSettings(floorId, settings));
      if (floorId !== this.floorId) return;
      this._background.set(saved);
    } catch (error) {
      if (floorId !== this.floorId) return;
      this._opacity.set(current.opacity);
      // A copy, not `current` itself: the signal must change so the fields show the saved values again.
      this._background.set({ ...current });
      this._error.set(describe(error));
    }
  }

  async remove(): Promise<void> {
    const floorId = this.floorId;
    if (!floorId || !this._background() || this._busy()) return;
    this._busy.set(true);
    this._error.set(null);
    try {
      this.cancelPendingOpacity();
      await firstValueFrom(this.client.delete(floorId));
      if (floorId !== this.floorId) return;
      this.clear();
    } catch (error) {
      this._error.set(describe(error));
    } finally {
      this._busy.set(false);
    }
  }

  private cancelPendingOpacity(): void {
    if (this.opacityTimer !== null) clearTimeout(this.opacityTimer);
    this.opacityTimer = null;
  }

  /** `image` is the blob just uploaded, so it need not be downloaded again. */
  private async show(floorId: string, background: FloorBackground, image?: Blob, run = this.loadRun): Promise<void> {
    const blob = image ?? (await firstValueFrom(this.client.image(floorId)));
    const pixels = await measure(blob);
    if (run !== this.loadRun || floorId !== this.floorId) return;
    this._background.set(background);
    this._opacity.set(background.opacity);
    this.setImage(URL.createObjectURL(blob), pixels);
  }

  private clear(): void {
    this._background.set(null);
    this.setImage(null, null);
  }

  private setImage(url: string | null, pixels: { width: number; height: number } | null): void {
    const previous = this._url();
    if (previous) URL.revokeObjectURL(previous);
    this._url.set(url);
    this._pixels.set(pixels);
  }
}

type Kind = 'image' | 'pdf';

/** By type, or by extension when the browser does not say. The server checks the real content. */
function kindOf(file: File): Kind | null {
  const name = file.name.toLowerCase();
  if (file.type === 'image/png' || file.type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name)) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return null;
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** How long the opacity slider must rest before its value is saved. */
const OPACITY_SAVE_DELAY_MS = 300;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const scaleOutOfRange = () => $localize`:@@background.err.scale:The scale must be between 0.01 and 100 cm per pixel.`;

const tooLarge = () => $localize`:@@background.err.tooLarge:The image must be at most 10 MB.`;
const unreadablePdf = () => $localize`:@@background.err.pdf:This PDF could not be read. Export the plan as PNG or JPG instead.`;

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? (error.error as { code?: string }).code
    : undefined;
}

function describe(error: unknown): string {
  switch (codeOf(error)) {
    case 'UNSUPPORTED_IMAGE_TYPE':
      return $localize`:@@background.err.unsupported:This file is not a PNG or JPG image.`;
    case 'IMAGE_TOO_LARGE':
      return tooLarge();
    case 'FLOOR_NOT_FOUND':
      return $localize`:@@background.err.floorNotFound:This floor no longer exists.`;
    case 'FLOOR_BACKGROUND_NOT_FOUND':
      return $localize`:@@background.err.notFound:The background image was already removed.`;
    case 'VALIDATION_FAILED':
      return $localize`:@@background.err.validation:Opacity must be 0–100% and the scale between 0.01 and 100 cm per pixel.`;
    case 'FORBIDDEN':
      return $localize`:@@background.err.forbidden:You are not allowed to do this.`;
  }
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return $localize`:@@background.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@background.err.generic:Something went wrong. Please try again.`;
}
