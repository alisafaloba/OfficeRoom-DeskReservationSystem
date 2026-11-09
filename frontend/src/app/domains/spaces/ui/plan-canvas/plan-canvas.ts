import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DraftPreview } from '@app/spaces/data/floor-plan-editor-store';
import { PlanElement, Point } from '@app/spaces/models/floor-plan';
import { boundsOf, labelAnchor } from '@app/spaces/util/plan-geometry';
import { counterScale, fitLabel, Viewport } from '@app/spaces/util/viewport';

/** Label text size on screen, in px. Labels keep this size at every zoom level. */
const LABEL_FONT_PX = 13;
/** Rough glyph width at that size, used to cut a label to its shape. */
const LABEL_GLYPH_PX = 7.5;
/** Thinnest a wall may look on screen, in px, however far out the view is zoomed. */
const MIN_WALL_PX = 2;

/** Wheel delta in pixels: Firefox mice report lines (deltaMode 1), some devices pages (2). */
function wheelDeltaPx(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 400;
  return event.deltaY;
}

/** Keys the canvas handles itself; the browser default (e.g. Backspace navigating back) is suppressed. */
const HANDLED_KEYS = new Set(['Enter', 'Escape', 'Backspace', 'Delete']);

/**
 * Renders the plan as SVG and turns raw DOM input into plain events: pointer positions in
 * screen pixels relative to the canvas, zoom and pan gestures, and keys. It holds no plan state.
 */
@Component({
  selector: 'app-plan-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-canvas.html',
})
export class PlanCanvas {
  /** Already in drawing order (back to front). */
  readonly elements = input.required<readonly PlanElement[]>();
  readonly viewport = input.required<Viewport>();
  readonly preview = input<DraftPreview | null>(null);
  readonly selectedId = input<string | null>(null);
  readonly label = input.required<string>();
  /** Crosshair cursor while a drawing tool is active. */
  readonly drawing = input(false);

  readonly pointerDownAt = output<Point>();
  readonly pointerMoveAt = output<Point>();
  /** `repeat` marks the second click of a double-click. */
  readonly pointerUpAt = output<{ readonly at: Point; readonly repeat: boolean }>();
  readonly pointerCancelled = output<void>();
  readonly doubleClicked = output<void>();
  readonly keyPressed = output<string>();
  readonly zoomed = output<{ readonly at: Point; readonly factor: number }>();
  readonly panned = output<{ readonly dx: number; readonly dy: number }>();

  private panFrom: Point | null = null;
  private spaceHeld = false;

  protected readonly labelFontPx = LABEL_FONT_PX;

  protected readonly worldTransform = computed(() => {
    const { zoom, panX, panY } = this.viewport();
    return `translate(${panX} ${panY}) scale(${zoom})`;
  });

  /** Handles and labels are drawn in plan space, scaled back so they stay the same size on screen. */
  protected readonly handleRadius = computed(() => 4 * counterScale(this.viewport()));

  /** Extra width of the selection halo around a wall, constant on screen. */
  protected readonly selectionPad = computed(() => 8 * counterScale(this.viewport()));

  protected points(points: readonly Point[]): string {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }

  protected wallWidth(thickness: number): number {
    return Math.max(thickness, MIN_WALL_PX * counterScale(this.viewport()));
  }

  protected placedTransform(position: Point, rotation: number): string {
    return `translate(${position.x} ${position.y}) rotate(${rotation})`;
  }

  /** Position and constant on-screen size for a polygon's label. */
  protected labelTransform(points: readonly Point[]): string {
    const anchor = labelAnchor(points);
    return `translate(${anchor.x} ${anchor.y}) scale(${counterScale(this.viewport())})`;
  }

  /** Always shown, cut with an ellipsis to the shape's width on screen; the shape keeps a <title> with the full text. */
  protected labelText(label: string | undefined, points: readonly Point[]): string {
    if (!label) return '';
    const box = boundsOf(points);
    return fitLabel(label, box.maxX - box.minX, LABEL_GLYPH_PX, this.viewport());
  }

  protected onPointerDown(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    svg.focus();
    try {
      // Keeps a drag that leaves the canvas flowing to us until release.
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Not an active pointer (e.g. a synthetic event): nothing to capture.
    }
    // Middle button, or Space + drag, pans whatever the active tool is.
    if (event.button === 1 || (event.button === 0 && this.spaceHeld)) {
      event.preventDefault();
      this.panFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button === 0) this.pointerDownAt.emit(this.local(event));
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.panFrom) {
      this.panned.emit({ dx: event.clientX - this.panFrom.x, dy: event.clientY - this.panFrom.y });
      this.panFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    this.pointerMoveAt.emit(this.local(event));
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.panFrom) {
      this.panFrom = null;
      return;
    }
    if (event.button === 0) this.pointerUpAt.emit({ at: this.local(event), repeat: event.detail >= 2 });
  }

  /** A cancelled gesture must not place or select anything, whatever `button` says. */
  protected onPointerCancel(): void {
    this.panFrom = null;
    this.pointerCancelled.emit();
  }

  /** Focus left the canvas: a Space keyup may never reach us, so don't stay in pan mode. */
  protected onBlur(): void {
    this.spaceHeld = false;
    this.panFrom = null;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomed.emit({ at: this.local(event), factor: Math.exp(-wheelDeltaPx(event) * 0.0015) });
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault();
      this.spaceHeld = true;
    } else if (HANDLED_KEYS.has(event.key)) {
      event.preventDefault();
      this.keyPressed.emit(event.key);
    }
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') this.spaceHeld = false;
  }

  private local(event: MouseEvent): Point {
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
