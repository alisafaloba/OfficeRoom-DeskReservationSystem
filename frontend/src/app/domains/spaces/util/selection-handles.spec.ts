import { Frame, frameCorners } from './plan-transform';
import { hitHandle, overlayFor, resizeByCorner, rotateTo } from './selection-handles';

const frame: Frame = { center: { x: 200, y: 200 }, width: 140, height: 70, rotation: 0 };

describe('selection handles', () => {
  it('puts resize handles on the corners and the rotate handle above the top edge', () => {
    const overlay = overlayFor(frame, { resizable: true, rotatable: true }, 1);
    expect(overlay.corners.map((c) => c.at)).toEqual(frameCorners(frame));
    expect(overlay.rotate?.at).toEqual({ x: 200, y: 200 - 35 - 28 });
  });

  it('keeps the handles the same size on screen at any zoom', () => {
    const near = overlayFor(frame, { resizable: true, rotatable: true }, 4);
    expect(near.rotate!.at.y).toBeCloseTo(200 - 35 - 7);
    expect(hitHandle(near, { x: 270 + 2, y: 235 }, 4)).toBe('se');
    expect(hitHandle(near, { x: 270 + 20, y: 235 }, 4)).toBeNull();
  });

  it('follows the rotation of the element', () => {
    const overlay = overlayFor({ ...frame, rotation: 90 }, { resizable: true, rotatable: true }, 1);
    expect(overlay.rotate!.at.x).toBeCloseTo(200 + 35 + 28);
    expect(overlay.rotate!.at.y).toBeCloseTo(200);
  });

  it('offers no handles to a multi-selection', () => {
    const overlay = overlayFor(frame, { resizable: false, rotatable: false }, 1);
    expect(overlay.corners).toEqual([]);
    expect(overlay.rotate).toBeNull();
    expect(hitHandle(overlay, { x: 270, y: 235 }, 1)).toBeNull();
  });

  it('resizes along the rotated axes', () => {
    const turned = { ...frame, rotation: 90 };
    // a quarter turn clockwise: the desk's own east side now points down the screen
    const next = resizeByCorner(turned, 'se', { x: 165, y: 370 });
    expect(next.width).toBeGreaterThan(frame.width);
    expect(next.rotation).toBe(90);
  });

  it('leaves a flat axis flat', () => {
    const wall: Frame = { center: { x: 100, y: 100 }, width: 200, height: 0, rotation: 0 };
    expect(resizeByCorner(wall, 'se', { x: 300, y: 500 }).height).toBe(0);
  });

  it('rotates relative to where the gesture started and snaps in 15 degree steps', () => {
    const start = { x: 200, y: 100 };
    expect(rotateTo(frame, start, { x: 300, y: 200 }, false).rotation).toBe(90);
    expect(rotateTo(frame, start, { x: 300, y: 170 }, true).rotation).toBe(75);
    expect(rotateTo({ ...frame, rotation: 350 }, start, { x: 300, y: 200 }, false).rotation).toBe(80);
  });
});
