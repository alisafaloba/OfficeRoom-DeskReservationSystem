/** How a floor's background image is shown, as the server answers it (the image is a separate download). */
export interface FloorBackground {
  readonly contentType: 'image/png' | 'image/jpeg';
  readonly sizeBytes: number;
  /** 0 (invisible) to 100 (fully opaque). */
  readonly opacity: number;
  /** Plan centimetres covered by one image pixel. */
  readonly cmPerPixel: number;
  /** Plan position (cm) of the top-left corner of the image as drawn, after rotation. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: Rotation;
  /** False while hidden: the image stays stored but is not drawn. */
  readonly visible: boolean;
  readonly updatedAt: string;
}

/** Clockwise quarter turns, in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

/** Every display setting; the editor always saves all of them together. */
export interface FloorBackgroundSettings {
  readonly opacity: number;
  readonly cmPerPixel: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: Rotation;
  readonly visible: boolean;
}

/** What the canvas draws: the image sized in plan units (cm) and placed on the plan. */
export interface BackgroundLayer {
  readonly url: string;
  /** Size of the unrotated image, in cm. */
  readonly width: number;
  readonly height: number;
  /** Plan position (cm) of the top-left corner of the drawn (rotated) image. */
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  /** 0 to 1. */
  readonly opacity: number;
}

/** Same limit as the server; checked first so a big file fails fast, before the upload. */
export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;

/** The scale range the server accepts (FloorBackgroundSettingsRequest), in cm per image pixel. */
export const MIN_CM_PER_PIXEL = 0.01;
export const MAX_CM_PER_PIXEL = 100;

/** How far the image may be moved from the plan origin, in cm (1 km), as the server allows. */
export const MAX_OFFSET_CM = 100_000;

export const isValidOffset = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_OFFSET_CM;

export const isValidScale = (value: number): boolean =>
  Number.isFinite(value) && value >= MIN_CM_PER_PIXEL && value <= MAX_CM_PER_PIXEL;
