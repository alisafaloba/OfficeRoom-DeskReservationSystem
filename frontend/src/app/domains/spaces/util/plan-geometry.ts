import { PlanElement, PlanElementType, Point } from '@app/spaces/models/floor-plan';

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Plan coordinates are stored with a resolution of one unit (1 cm). */
export const roundPoint = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The four corners of the rectangle spanned by two opposite corners, clockwise from top-left. */
export function rectPoints(a: Point, b: Point): Point[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function boundsOf(points: readonly Point[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Where a polygon's label goes: the area centroid, or the bounding-box center when the
 * centroid falls outside a concave shape.
 */
export function labelAnchor(polygon: readonly Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const box = boundsOf(polygon);
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  if (Math.abs(area) < 1e-6) return center;
  const centroid = { x: cx / (3 * area), y: cy / (3 * area) };
  if (pointInPolygon(centroid, polygon)) return centroid;
  return pointInPolygon(center, polygon) ? center : polygon[0];
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function distanceToPolyline(p: Point, points: readonly Point[], closed: boolean): number {
  const segments = closed ? points.length : points.length - 1;
  let best = Infinity;
  for (let i = 0; i < segments; i++) {
    best = Math.min(best, distanceToSegment(p, points[i], points[(i + 1) % points.length]));
  }
  return best;
}

/** Back to front: areas first, desks last, so a desk is drawn (and hit) above its room. */
const DRAW_RANK: Record<PlanElementType, number> = {
  ZONE: 0,
  ROOM: 1,
  DECOR: 2,
  WALL: 3,
  OUTLINE: 3,
  DESK: 4,
};

export function inDrawOrder(elements: readonly PlanElement[]): PlanElement[] {
  // Array.prototype.sort is stable, so elements of one rank keep their creation order.
  return [...elements].sort((a, b) => DRAW_RANK[a.type] - DRAW_RANK[b.type]);
}

/** Id of the topmost element under `p`, or null. `zoom` keeps thin lines easy to hit on screen. */
export function hitTest(elements: readonly PlanElement[], p: Point, zoom: number): string | null {
  const slop = 4 / zoom;
  for (const element of inDrawOrder(elements).reverse()) {
    switch (element.type) {
      case 'WALL':
      case 'OUTLINE': {
        const reach = Math.max(element.thickness / 2, slop);
        if (distanceToPolyline(p, element.points, element.type === 'OUTLINE') <= reach) return element.id;
        break;
      }
      case 'ZONE':
      case 'ROOM':
        if (pointInPolygon(p, element.points)) return element.id;
        break;
      case 'DESK':
      case 'DECOR': {
        const angle = (-element.rotation * Math.PI) / 180;
        const dx = p.x - element.position.x;
        const dy = p.y - element.position.y;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (Math.abs(localX) <= element.width / 2 + slop && Math.abs(localY) <= element.height / 2 + slop) {
          return element.id;
        }
        break;
      }
    }
  }
  return null;
}
