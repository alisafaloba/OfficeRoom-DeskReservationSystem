import { Point } from '@app/spaces/models/floor-plan';

/**
 * Maps plan units to screen pixels: `screen = plan * zoom + pan`. The plan itself never
 * changes with the viewport, so stored coordinates are independent of the zoom level.
 */
export interface Viewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const MIN_ZOOM = 0.02;
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

/** Constant on-screen size for labels and handles: the factor to scale a plan-space group by. */
export const counterScale = (viewport: Viewport): number => 1 / viewport.zoom;

/** A label is shown only when its shape is at least as wide on screen as the text. */
export function labelFits(shapeWidthPlan: number, textWidthPx: number, viewport: Viewport): boolean {
  return shapeWidthPlan * viewport.zoom >= textWidthPx;
}
