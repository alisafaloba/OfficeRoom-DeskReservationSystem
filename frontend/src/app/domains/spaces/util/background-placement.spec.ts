import { BackgroundLayer } from '@app/spaces/models/floor-background';
import { backgroundBounds, backgroundTransform, calibratedScale, rotatedSize, turn } from './background-placement';

const layer = (over: Partial<BackgroundLayer> = {}): BackgroundLayer => ({
  url: 'blob:x',
  width: 400,
  height: 100,
  x: 10,
  y: 20,
  rotation: 0,
  opacity: 1,
  ...over,
});

/** Where a point of the unrotated image lands, applying the transform by hand. */
function place(transform: string, p: { x: number; y: number }): { x: number; y: number } {
  const t = /translate\(([-\d.]+) ([-\d.]+)\)(?: rotate\((\d+)\))?/.exec(transform)!;
  const [tx, ty, r] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  const rad = (r * Math.PI) / 180;
  const x = Math.round(p.x * Math.cos(rad) - p.y * Math.sin(rad));
  const y = Math.round(p.x * Math.sin(rad) + p.y * Math.cos(rad));
  return { x: x + tx, y: y + ty };
}

describe('background placement', () => {
  it('swaps width and height for a quarter turn', () => {
    expect(rotatedSize(layer())).toEqual({ width: 400, height: 100 });
    expect(rotatedSize(layer({ rotation: 90 }))).toEqual({ width: 100, height: 400 });
    expect(rotatedSize(layer({ rotation: 180 }))).toEqual({ width: 400, height: 100 });
    expect(rotatedSize(layer({ rotation: 270 }))).toEqual({ width: 100, height: 400 });
  });

  it('keeps the top-left corner of the turned image at (x, y) for every rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const l = layer({ rotation });
      const t = backgroundTransform(l);
      const corners = [
        { x: 0, y: 0 },
        { x: l.width, y: 0 },
        { x: 0, y: l.height },
        { x: l.width, y: l.height },
      ].map((c) => place(t, c));
      const box = backgroundBounds(l);
      expect(Math.min(...corners.map((c) => c.x))).toBe(10);
      expect(Math.min(...corners.map((c) => c.y))).toBe(20);
      expect(Math.max(...corners.map((c) => c.x))).toBe(box.maxX);
      expect(Math.max(...corners.map((c) => c.y))).toBe(box.maxY);
    }
  });

  it('turns clockwise and anticlockwise, wrapping around', () => {
    expect(turn(0, 1)).toBe(90);
    expect(turn(270, 1)).toBe(0);
    expect(turn(0, -1)).toBe(270);
    expect(turn(180, -1)).toBe(90);
  });

  it('derives the scale from two points and their real distance', () => {
    // 300 plan cm apart at 2 cm/px = 150 image px; really 450 cm → 3 cm/px.
    expect(calibratedScale({ x: 0, y: 0 }, { x: 180, y: 240 }, 2, 450)).toBe(3);
    expect(calibratedScale({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, 450)).toBeNull();
    expect(calibratedScale({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, 0)).toBeNull();
  });
});
