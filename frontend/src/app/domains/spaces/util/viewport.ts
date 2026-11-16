import { Point } from '@app/spaces/models/floor-plan';
import { Bounds } from './plan-geometry';

/**
 * Maps plan units to screen pixels: `screen = plan * zoom + pan`. The plan itself never
 * changes with the viewport, so stored coordinates are independent of the zoom level.
 */
export interface Viewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export const INITIAL_VIEWPORT: Viewport = { zoom: 0.25, panX: 40, panY: 40 };

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export function screenToPlan(viewport: Viewport, screen: Point): Point {
  return { x: (screen.x - viewport.panX) / viewport.zoom, y: (screen.y - viewport.panY) / viewport.zoom };
}

export function planToScreen(viewport: Viewport, plan: Point): Point {
  return { x: plan.x * viewport.zoom + viewport.panX, y: plan.y * viewport.zoom + viewport.panY };
}

/** Zooms by `factor` keeping the plan point under `screen` where it is. */
export function zoomAt(viewport: Viewport, screen: Point, factor: number): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  const anchor = screenToPlan(viewport, screen);
  return { zoom, panX: screen.x - anchor.x * zoom, panY: screen.y - anchor.y * zoom };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

/** The viewport that centres `bounds` in a `width` x `height` canvas, leaving `padding` px around it. */
export function fitToBounds(bounds: Bounds, width: number, height: number, padding = 40): Viewport {
  const planWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const planHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const zoom = clampZoom(
    Math.min((width - 2 * padding) / planWidth, (height - 2 * padding) / planHeight),
  );
  return {
    zoom,
    panX: (width - planWidth * zoom) / 2 - bounds.minX * zoom,
    panY: (height - planHeight * zoom) / 2 - bounds.minY * zoom,
  };
}

/** Constant on-screen size for labels and handles: the factor to scale a plan-space group by. */
export const counterScale = (viewport: Viewport): number => 1 / viewport.zoom;

/** The label cut with an ellipsis to the shape's on-screen width; never empty, so it stays visible at any zoom. */
export function fitLabel(label: string, shapeWidthPlan: number, glyphPx: number, viewport: Viewport): string {
  const maxChars = Math.floor((shapeWidthPlan * viewport.zoom) / glyphPx);
  if (label.length <= maxChars) return label;
  if (maxChars <= 1) return '…';
  return `${label.slice(0, maxChars - 1).trimEnd()}…`;
}
