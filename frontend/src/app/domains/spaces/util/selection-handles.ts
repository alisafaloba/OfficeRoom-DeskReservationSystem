import { Point } from '@app/spaces/models/floor-plan';
import { distance } from './plan-geometry';
import { Frame, frameCorners, MIN_SIZE, normalizeAngle, rotatePoint } from './plan-transform';

export type Corner = 'nw' | 'ne' | 'se' | 'sw';

export type HandleHit = Corner | 'rotate';

const CORNERS: readonly Corner[] = ['nw', 'ne', 'se', 'sw'];

const SIGNS: Record<Corner, { readonly x: -1 | 1; readonly y: -1 | 1 }> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

/** Screen-pixel sizes, divided by the zoom to get plan units. */
const HANDLE_HIT_PX = 9;
const ROTATE_DISTANCE_PX = 28;
/** Shift while rotating snaps to this step, in degrees. */
export const ROTATE_SNAP_DEGREES = 15;

export interface SelectionOverlay {
  /** Outline of the selection box, four corners. */
  readonly outline: readonly Point[];
  /** Resize handles; empty when the selection cannot be resized. */
  readonly corners: readonly { readonly corner: Corner; readonly at: Point }[];
  /** Rotate handle and the point of the box edge it hangs from. */
  readonly rotate: { readonly from: Point; readonly at: Point } | null;
}

export function overlayFor(frame: Frame, options: { resizable: boolean; rotatable: boolean }, zoom: number): SelectionOverlay {
  const outline = frameCorners(frame);
  const rotate = options.rotatable
    ? {
        from: midpoint(outline[0], outline[1]),
        at: add(frame.center, rotatePoint({ x: 0, y: -frame.height / 2 - ROTATE_DISTANCE_PX / zoom }, frame.rotation)),
      }
    : null;
  return {
    outline,
    corners: options.resizable ? CORNERS.map((corner, i) => ({ corner, at: outline[i] })) : [],
    rotate,
  };
}

/** Which handle is under `p`, if any. The rotate handle wins where it overlaps a corner. */
export function hitHandle(overlay: SelectionOverlay, p: Point, zoom: number): HandleHit | null {
  const reach = HANDLE_HIT_PX / zoom;
  if (overlay.rotate && distance(overlay.rotate.at, p) <= reach) return 'rotate';
  for (const { corner, at } of overlay.corners) {
    if (distance(at, p) <= reach) return corner;
  }
  return null;
}

/**
 * The frame after dragging `corner` to `pointer`: the opposite corner stays where it is. The work
 * happens in the frame's own (rotated) axes, so a turned desk resizes along its own sides.
 */
export function resizeByCorner(frame: Frame, corner: Corner, pointer: Point): Frame {
  const sign = SIGNS[corner];
  const toLocal = (p: Point) => rotatePoint({ x: p.x - frame.center.x, y: p.y - frame.center.y }, -frame.rotation);
  const anchor = { x: (-sign.x * frame.width) / 2, y: (-sign.y * frame.height) / 2 };
  const target = toLocal(pointer);
  // A flat axis (width or height 0) cannot be dragged out of nothing: it stays flat.
  const width = frame.width === 0 ? 0 : Math.max(MIN_SIZE, (target.x - anchor.x) * sign.x);
  const height = frame.height === 0 ? 0 : Math.max(MIN_SIZE, (target.y - anchor.y) * sign.y);
  const localCenter = { x: anchor.x + (sign.x * width) / 2, y: anchor.y + (sign.y * height) / 2 };
  return { ...frame, width, height, center: add(frame.center, rotatePoint(localCenter, frame.rotation)) };
}

/**
 * The rotation that keeps the angle between the pointer and the center that the gesture started with.
 * `snap` rounds the result to whole steps of 15 degrees.
 */
export function rotateTo(frame: Frame, startPointer: Point, pointer: Point, snap: boolean): Frame {
  const angleOf = (p: Point) => (Math.atan2(p.y - frame.center.y, p.x - frame.center.x) * 180) / Math.PI;
  const rotation = frame.rotation + angleOf(pointer) - angleOf(startPointer);
  const snapped = snap ? Math.round(rotation / ROTATE_SNAP_DEGREES) * ROTATE_SNAP_DEGREES : rotation;
  return { ...frame, rotation: normalizeAngle(snapped) };
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
