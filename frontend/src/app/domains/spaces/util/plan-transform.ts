import { PlanElement, Point } from '@app/spaces/models/floor-plan';
import { Bounds, boundsOf, roundPoint } from './plan-geometry';

/** Smallest width or height an edit may produce, in plan units. */
export const MIN_SIZE = 10;

/**
 * Where an element sits, independent of its type: a center, a size and a rotation. Placed elements
 * (desks, decor) have these natively; shapes made of points use their bounding box and never rotate.
 */
export interface Frame {
  readonly center: Point;
  readonly width: number;
  readonly height: number;
  /** Degrees, clockwise. Always 0 for shapes made of points. */
  readonly rotation: number;
}

export type PlacedElement = Extract<PlanElement, { position: Point }>;

export const isPlaced = (element: PlanElement): element is PlacedElement => 'position' in element;

export const rotatePoint = (p: Point, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180;
  return { x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) };
};

export const normalizeAngle = (degrees: number): number => Math.round((((degrees % 360) + 360) % 360) * 100) / 100;

/** Corners of a frame in plan space, clockwise from the top-left one. */
export function frameCorners(frame: Frame): Point[] {
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([sx, sy]) => {
    const local = rotatePoint({ x: (sx * frame.width) / 2, y: (sy * frame.height) / 2 }, frame.rotation);
    return { x: frame.center.x + local.x, y: frame.center.y + local.y };
  });
}

export function frameOf(element: PlanElement): Frame {
  if (isPlaced(element)) {
    return { center: element.position, width: element.width, height: element.height, rotation: element.rotation };
  }
  const box = boundsOf(element.points);
  return {
    center: { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
    rotation: 0,
  };
}

/** The element reshaped to `next`: placed elements take it as is, point shapes are scaled and moved to it. */
export function applyFrame(element: PlanElement, next: Frame): PlanElement {
  if (isPlaced(element)) {
    return {
      ...element,
      position: roundPoint(next.center),
      width: Math.round(next.width),
      height: Math.round(next.height),
      rotation: normalizeAngle(next.rotation),
    };
  }
  const old = frameOf(element);
  // A flat shape (a straight wall) has no extent on one axis: nothing to scale there, it only moves.
  const sx = old.width > 0 ? next.width / old.width : 1;
  const sy = old.height > 0 ? next.height / old.height : 1;
  const points = element.points.map((p) =>
    roundPoint({
      x: next.center.x + (p.x - old.center.x) * sx,
      y: next.center.y + (p.y - old.center.y) * sy,
    }),
  );
  return { ...element, points } as PlanElement;
}

export function translate(element: PlanElement, dx: number, dy: number): PlanElement {
  const frame = frameOf(element);
  return applyFrame(element, { ...frame, center: { x: frame.center.x + dx, y: frame.center.y + dy } });
}

/** Axis-aligned bounds of what is drawn, including the rotation of placed elements. */
export function elementBounds(element: PlanElement): Bounds {
  return boundsOf(frameCorners(frameOf(element)));
}

export function unionBounds(boxes: readonly Bounds[]): Bounds {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export const boundsFrame = (box: Bounds): Frame => ({
  center: { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
  width: box.maxX - box.minX,
  height: box.maxY - box.minY,
  rotation: 0,
});

export const containsBounds = (outer: Bounds, inner: Bounds): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

/** A copy for pasting: new geometry only, never anything else the original carries (e.g. a resource link). */
export function copyOf(element: PlanElement, id: string, dx: number, dy: number): PlanElement {
  const moved = translate(element, dx, dy);
  switch (moved.type) {
    case 'DESK':
      return { id, type: 'DESK', position: moved.position, width: moved.width, height: moved.height, rotation: moved.rotation };
    case 'DECOR':
      return { id, type: 'DECOR', kind: moved.kind, position: moved.position, width: moved.width, height: moved.height, rotation: moved.rotation };
    case 'WALL':
    case 'OUTLINE':
      return { id, type: moved.type, points: moved.points, thickness: moved.thickness };
    case 'ZONE':
      return { id, type: 'ZONE', points: moved.points, ...(moved.label === undefined ? {} : { label: moved.label }) };
    case 'ROOM':
      return { id, type: 'ROOM', points: moved.points, label: moved.label };
  }
}
