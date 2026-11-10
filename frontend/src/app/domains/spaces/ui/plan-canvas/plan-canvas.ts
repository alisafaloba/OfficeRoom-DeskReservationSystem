import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DraftPreview } from '@app/spaces/data/floor-plan-editor-store';
import { PlanElement, Point } from '@app/spaces/models/floor-plan';
import { boundsOf, GRID_SIZE, labelAnchor } from '@app/spaces/util/plan-geometry';
import { counterScale, fitLabel, Viewport } from '@app/spaces/util/viewport';

/** Label text size on screen, in px. Labels keep this size at every zoom level. */
const LABEL_FONT_PX = 13;
/** Rough glyph width at that size, used to cut a label to its shape. */
const LABEL_GLYPH_PX = 7.5;
/** Thinnest a wall may look on screen, in px, however far out the view is zoomed. */
const MIN_WALL_PX = 2;
/** A press that moves farther than this many px is a pan, not a click. */
const PAN_THRESHOLD_PX = 4;
/** Trackpad pinch arrives as Ctrl + wheel with tiny deltas, so it zooms faster per pixel. */
const WHEEL_ZOOM_SPEED = 0.0015;
const PINCH_ZOOM_SPEED = 0.01;

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
  /** Dragging the empty canvas pans (Select tool); the drawing tools keep Space or middle button. */
  readonly panOnDrag = input(false);
  /** Distance between grid lines, in plan units. */
  readonly gridSize = input<number>(GRID_SIZE);

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
  private dragOrigin: Point | null = null;

  protected readonly labelFontPx = LABEL_FONT_PX;

  protected readonly worldTransform = computed(() => {
    const { zoom, panX, panY } = this.viewport();
    return `translate(${panX} ${panY}) scale(${zoom})`;
  });

  /** Handles and labels are drawn in plan space, scaled back so they stay the same size on screen. */
  protected readonly handleRadius = computed(() => 4 * counterScale(this.viewport()));

  /** Extra width of the selection halo around a wall, constant on screen. */
  protected readonly selectionPad = computed(() => 8 * counterScale(this.viewport()));
  /** Hidden once cells are too small on screen to read as a grid. */
  protected readonly gridVisible = computed(() => this.gridSize() * this.viewport().zoom >= 6);

  /** One screen pixel, in plan units, so grid lines stay hairlines at every zoom. */
  protected readonly gridStroke = computed(() => counterScale(this.viewport()));

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
    if (event.button === 0) {
      if (this.panOnDrag()) this.dragOrigin = { x: event.clientX, y: event.clientY };
      this.pointerDownAt.emit(this.local(event));
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (
      this.dragOrigin &&
      !this.panFrom &&
      Math.hypot(event.clientX - this.dragOrigin.x, event.clientY - this.dragOrigin.y) > PAN_THRESHOLD_PX
    ) {
      this.panFrom = this.dragOrigin; // no longer a click: drop the press, pan from where it began
      this.pointerCancelled.emit();
    }
    if (this.panFrom) {
      this.panned.emit({ dx: event.clientX - this.panFrom.x, dy: event.clientY - this.panFrom.y });
      this.panFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    this.pointerMoveAt.emit(this.local(event));
  }

  protected onPointerUp(event: PointerEvent): void {
    this.dragOrigin = null;
    if (this.panFrom) {
      this.panFrom = null;
      return;
    }
    if (event.button === 0)
      this.pointerUpAt.emit({ at: this.local(event), repeat: event.detail >= 2 });
  }

  /** A cancelled gesture must not place or select anything, whatever `button` says. */
  protected onPointerCancel(): void {
    this.dragOrigin = null;
    this.panFrom = null;
    this.pointerCancelled.emit();
  }

  /** Focus left the canvas: a Space keyup may never reach us, so don't stay in pan mode. */
  protected onBlur(): void {
    this.spaceHeld = false;
    this.dragOrigin = null;
    this.panFrom = null;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const speed = event.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
    this.zoomed.emit({ at: this.local(event), factor: Math.exp(-wheelDeltaPx(event) * speed) });
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
