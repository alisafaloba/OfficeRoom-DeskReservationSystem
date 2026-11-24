import { Bounds, distance } from '@app/spaces/util/plan-geometry';
import { BackgroundLayer, Rotation } from '@app/spaces/models/floor-background';
import { Point } from '@app/spaces/models/floor-plan';

/** The image's size as drawn: a quarter turn swaps width and height. */
export function rotatedSize(layer: Pick<BackgroundLayer, 'width' | 'height' | 'rotation'>): {
  width: number;
  height: number;
} {
  const sideways = layer.rotation === 90 || layer.rotation === 270;
  return sideways ? { width: layer.height, height: layer.width } : { width: layer.width, height: layer.height };
}

/**
 * SVG transform that draws the unrotated image (at 0,0, `width` x `height`) turned clockwise,
 * with the top-left corner of the turned image at (x, y). The corner stays put when it turns.
 */
export function backgroundTransform(layer: BackgroundLayer): string {
  const { x, y, width: w, height: h } = layer;
  switch (layer.rotation) {
    case 0:
      return `translate(${x} ${y})`;
    case 90:
      return `translate(${x + h} ${y}) rotate(90)`;
    case 180:
      return `translate(${x + w} ${y + h}) rotate(180)`;
    case 270:
      return `translate(${x} ${y + w}) rotate(270)`;
  }
}

/** The area the image covers on the plan, for Fit to screen. */
export function backgroundBounds(layer: BackgroundLayer): Bounds {
  const size = rotatedSize(layer);
  return { minX: layer.x, minY: layer.y, maxX: layer.x + size.width, maxY: layer.y + size.height };
}

/** The next quarter turn, clockwise (`1`) or anticlockwise (`-1`). */
export function turn(rotation: Rotation, direction: 1 | -1): Rotation {
  return (((rotation + direction * 90) % 360) + 360) % 360 as Rotation;
}

/**
 * The scale that makes the two picked points `realCm` apart. The points are in plan units at
 * the current scale, so their distance divided by it is their distance in image pixels; null
 * when the points coincide.
 */
export function calibratedScale(a: Point, b: Point, cmPerPixel: number, realCm: number): number | null {
  const pixels = distance(a, b) / cmPerPixel;
  if (!(pixels > 0) || !(realCm > 0)) return null;
  return realCm / pixels;
}
