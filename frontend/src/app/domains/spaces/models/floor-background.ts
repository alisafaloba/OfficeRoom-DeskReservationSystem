/** How a floor's background image is shown, as the server answers it (the image is a separate download). */
export interface FloorBackground {
  readonly contentType: 'image/png' | 'image/jpeg';
  readonly sizeBytes: number;
  /** 0 (invisible) to 100 (fully opaque). */
  readonly opacity: number;
  /** Plan centimetres covered by one image pixel. */
  readonly cmPerPixel: number;
  readonly updatedAt: string;
}

export interface FloorBackgroundSettings {
  readonly opacity: number;
  readonly cmPerPixel: number;
}

/** What the canvas draws: the image already sized in plan units (cm), placed at the plan origin. */
export interface BackgroundLayer {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** 0 to 1. */
  readonly opacity: number;
}

/** Same limit as the server; checked first so a big file fails fast, before the upload. */
export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;

/** The scale range the server accepts (FloorBackgroundSettingsRequest), in cm per image pixel. */
export const MIN_CM_PER_PIXEL = 0.01;
export const MAX_CM_PER_PIXEL = 100;

export const isValidScale = (value: number): boolean =>
  Number.isFinite(value) && value >= MIN_CM_PER_PIXEL && value <= MAX_CM_PER_PIXEL;
