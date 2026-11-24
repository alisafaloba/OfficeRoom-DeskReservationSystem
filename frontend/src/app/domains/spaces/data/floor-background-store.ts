import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Point } from '@app/spaces/models/floor-plan';
import {
  BackgroundLayer,
  FloorBackground,
  FloorBackgroundSettings,
  isValidOffset,
  isValidScale,
  MAX_BACKGROUND_BYTES,
} from '@app/spaces/models/floor-background';
import { calibratedScale, turn } from '@app/spaces/util/background-placement';
import { PdfRasterizer } from '@app/spaces/util/pdf-rasterizer';
import { FloorBackgroundClient } from './floor-background-client';

/** What the canvas pointer does while the background is being adjusted. */
export type BackgroundMode = 'idle' | 'calibrating' | 'moving';

/** A multi-page PDF waiting for the admin to pick the page to use. */
export interface PdfChoice {
  readonly fileName: string;
  readonly pages: number;
}

/**
 * The background image of the floor being edited: the architectural plan the admin draws over.
 * Provided by the editor page. The image is held as an object URL, released when the page goes.
 *
 * Besides upload and the display settings, it runs the two canvas modes that adjust the image:
 * calibrating (pick two points, enter their real distance, get the scale) and moving (drag the
 * image into line with the drawing). The editor routes canvas input here while a mode is on.
 */
@Injectable()
export class FloorBackgroundStore {
  private readonly client = inject(FloorBackgroundClient);
  private readonly pdf = inject(PdfRasterizer);

  private floorId: string | null = null;
  /** Bumped by every load: an answer for a floor the editor has already left is dropped. */
  private loadRun = 0;
  private opacityTimer: ReturnType<typeof setTimeout> | null = null;
  private pdfFile: File | null = null;
  private drag: { readonly from: Point; readonly offset: Point } | null = null;

  private readonly _background = signal<FloorBackground | null>(null);
  private readonly _url = signal<string | null>(null);
  private readonly _pixels = signal<{ readonly width: number; readonly height: number } | null>(null);
  /** Shown while the slider moves; saved only when it is let go. */
  private readonly _opacity = signal(50);
  /** The offset shown while the image is dragged; saved when the drag ends. */
  private readonly _liveOffset = signal<Point | null>(null);
  private readonly _mode = signal<BackgroundMode>('idle');
  private readonly _calibration = signal<readonly Point[]>([]);
  private readonly _calibrationCursor = signal<Point | null>(null);
  private readonly _pdfChoice = signal<PdfChoice | null>(null);
  private readonly _busy = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly background = this._background.asReadonly();
  readonly opacity = this._opacity.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly pdfChoice = this._pdfChoice.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly error = this._error.asReadonly();

  /** Both calibration points are picked: the editor asks for their real distance. */
  readonly calibrationReady = computed(() => this._mode() === 'calibrating' && this._calibration().length === 2);

  /** The picked calibration points, plus a rubber band to the cursor after the first one. */
  readonly calibrationMarks = computed<readonly Point[]>(() => {
    if (this._mode() !== 'calibrating') return [];
    const points = this._calibration();
    const cursor = this._calibrationCursor();
    return points.length === 1 && cursor ? [...points, cursor] : points;
  });

  /** The image placed on the plan, or null while there is none, it is loading or it is hidden. */
  readonly layer = computed<BackgroundLayer | null>(() => {
    const background = this._background();
    const url = this._url();
    const pixels = this._pixels();
    if (!background || !url || !pixels || !background.visible) return null;
    const offset = this._liveOffset() ?? { x: background.offsetX, y: background.offsetY };
    return {
      url,
      width: pixels.width * background.cmPerPixel,
      height: pixels.height * background.cmPerPixel,
      x: offset.x,
      y: offset.y,
      rotation: background.rotation,
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
    this.cancelMode();
    this.cancelPdfChoice();
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

  /**
   * PNG and JPEG go up as they are. A one-page PDF is turned into an image of that page; for a
   * longer one the admin first picks the page ({@link choosePdfPage}).
   */
  async upload(file: File): Promise<void> {
    const floorId = this.floorId;
    if (!floorId || this._busy()) return;
    this._error.set(null);
    this.cancelPdfChoice();
    const kind = kindOf(file);
    if (kind === null) {
      this._error.set($localize`:@@background.err.type:Choose a PNG, JPG or PDF file.`);
      return;
    }
    if (kind === 'image') {
      await this.send(floorId, file, file.name);
      return;
    }
    this._busy.set(true);
    let pages: number;
    try {
      pages = await this.pdf.pageCount(file);
    } catch {
      this._busy.set(false);
      if (floorId === this.floorId) this._error.set(unreadablePdf());
      return;
    }
    this._busy.set(false);
    if (floorId !== this.floorId) return;
    if (pages > 1) {
      this.pdfFile = file;
      this._pdfChoice.set({ fileName: file.name, pages });
      return;
    }
    await this.sendPdfPage(floorId, file, 1);
  }

  /** Uploads the chosen page (1-based) of the PDF waiting for a choice. */
  async choosePdfPage(page: number): Promise<void> {
    const floorId = this.floorId;
    const file = this.pdfFile;
    const choice = this._pdfChoice();
    if (!floorId || !file || !choice || !Number.isInteger(page) || page < 1 || page > choice.pages) return;
    this.cancelPdfChoice();
    await this.sendPdfPage(floorId, file, page);
  }

  cancelPdfChoice(): void {
    this.pdfFile = null;
    this._pdfChoice.set(null);
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

  /** Hides the image without deleting it, or shows it again. */
  toggleVisible(): Promise<void> {
    const current = this._background();
    if (!current) return Promise.resolve();
    if (current.visible) this.cancelMode();
    return this.saveSettings({ visible: !current.visible });
  }

  /** Turns the image a quarter turn; its top-left corner stays where it is. */
  rotate(direction: 1 | -1): Promise<void> {
    const current = this._background();
    return current ? this.saveSettings({ rotation: turn(current.rotation, direction) }) : Promise.resolve();
  }

  /** Places the top-left corner of the image at (x, y) plan cm. */
  moveTo(x: number, y: number): Promise<void> {
    return this.saveSettings({ offsetX: x, offsetY: y });
  }

  /**
   * Saves the display settings, filling what `change` leaves out from the saved ones. A refused
   * value puts the saved ones back.
   */
  async saveSettings(change: Partial<FloorBackgroundSettings>): Promise<void> {
    const floorId = this.floorId;
    const current = this._background();
    if (!floorId || !current) return;
    const settings: FloorBackgroundSettings = {
      opacity: clamp(Math.round(change.opacity ?? this._opacity()), 0, 100),
      cmPerPixel: change.cmPerPixel ?? current.cmPerPixel,
      offsetX: round(change.offsetX ?? current.offsetX),
      offsetY: round(change.offsetY ?? current.offsetY),
      rotation: change.rotation ?? current.rotation,
      visible: change.visible ?? current.visible,
    };
    if (!isValidScale(settings.cmPerPixel)) {
      this._error.set(scaleOutOfRange());
      return;
    }
    if (!isValidOffset(settings.offsetX) || !isValidOffset(settings.offsetY)) {
      this._error.set(offsetOutOfRange());
      return;
    }
    this._error.set(null);
    this._opacity.set(settings.opacity);
    // Shown at once; the server's answer confirms it, a failure puts the saved values back.
    this._background.set({ ...current, ...settings });
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
      this.cancelMode();
      await firstValueFrom(this.client.delete(floorId));
      if (floorId !== this.floorId) return;
      this.clear();
    } catch (error) {
      this._error.set(describe(error));
    } finally {
      this._busy.set(false);
    }
  }

  // ---- canvas modes ------------------------------------------------------------------------

  /** Pick two points on the plan whose real distance is known, then {@link finishCalibration}. */
  startCalibration(): void {
    if (!this.layer()) return;
    this.cancelMode();
    this._error.set(null);
    this._mode.set('calibrating');
  }

  /** Drag the image into line with the drawing; ends with {@link cancelMode} ("Done", Esc). */
  toggleMoving(): void {
    if (this._mode() === 'moving') {
      this.cancelMode();
      return;
    }
    if (!this.layer()) return;
    this.cancelMode();
    this._mode.set('moving');
  }

  /** Leaves calibrating or moving; a drag in progress is put back, a picked point dropped. */
  cancelMode(): void {
    this._mode.set('idle');
    this._calibration.set([]);
    this._calibrationCursor.set(null);
    this.drag = null;
    this._liveOffset.set(null);
  }

  /** `realCm` is the true distance between the two picked points; sets the scale from it. */
  async finishCalibration(realCm: number): Promise<void> {
    const current = this._background();
    const [a, b] = this._calibration();
    this.cancelMode();
    if (!current || !a || !b) return;
    const scale = calibratedScale(a, b, current.cmPerPixel, realCm);
    if (scale === null) {
      this._error.set($localize`:@@background.err.calibrationPoints:Pick two different points and a distance above 0.`);
      return;
    }
    if (!isValidScale(scale)) {
      this._error.set(scaleOutOfRange());
      return;
    }
    await this.saveSettings({ cmPerPixel: Math.round(scale * 10_000) / 10_000 });
  }

  /** Canvas input while a mode is on, in plan coordinates. */
  pointerDown(point: Point): void {
    switch (this._mode()) {
      case 'calibrating':
        if (this._calibration().length < 2) this._calibration.update((points) => [...points, point]);
        break;
      case 'moving': {
        const background = this._background();
        if (background) this.drag = { from: point, offset: { x: background.offsetX, y: background.offsetY } };
        break;
      }
    }
  }

  pointerMove(point: Point): void {
    if (this._mode() === 'calibrating') {
      this._calibrationCursor.set(point);
      return;
    }
    const drag = this.drag;
    if (this._mode() === 'moving' && drag) {
      this._liveOffset.set({
        x: drag.offset.x + point.x - drag.from.x,
        y: drag.offset.y + point.y - drag.from.y,
      });
    }
  }

  /** Ends a drag and saves where the image ended up; moving stays on for the next drag. */
  pointerUp(): void {
    const offset = this._liveOffset();
    this.drag = null;
    if (this._mode() !== 'moving' || offset === null) return;
    void this.moveTo(offset.x, offset.y).finally(() => this._liveOffset.set(null));
  }

  pointerCancel(): void {
    this.drag = null;
    this._liveOffset.set(null);
  }

  // ---- internals ---------------------------------------------------------------------------

  private async sendPdfPage(floorId: string, file: File, page: number): Promise<void> {
    this._busy.set(true);
    let image: Blob;
    try {
      image = await this.pdf.page(file, page);
    } catch {
      this._busy.set(false);
      if (floorId === this.floorId) this._error.set(unreadablePdf());
      return;
    }
    this._busy.set(false);
    const base = file.name.replace(/\.pdf$/i, '');
    const suffix = page > 1 ? `-page-${page}` : '';
    await this.send(floorId, image, `${base}${suffix}.${image.type === 'image/jpeg' ? 'jpg' : 'png'}`);
  }

  private async send(floorId: string, image: Blob, name: string): Promise<void> {
    if (image.size > MAX_BACKGROUND_BYTES) {
      this._error.set(tooLarge());
      return;
    }
    this._busy.set(true);
    try {
      const background = await firstValueFrom(this.client.upload(floorId, image, name));
      if (floorId !== this.floorId) return;
      this.cancelMode();
      await this.show(floorId, background, image);
    } catch (error) {
      if (floorId !== this.floorId) return;
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

/** Offsets are saved to the millimetre. */
const round = (value: number) => Math.round(value * 10) / 10;

const offsetOutOfRange = () =>
  $localize`:@@background.err.offset:The position must be within 1 km (100000 cm) of the plan origin.`;

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
      return $localize`:@@background.err.validation:Opacity must be 0–100%, the scale between 0.01 and 100 cm per pixel and the position within 1 km.`;
    case 'FORBIDDEN':
      return $localize`:@@background.err.forbidden:You are not allowed to do this.`;
  }
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return $localize`:@@background.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@background.err.generic:Something went wrong. Please try again.`;
}
