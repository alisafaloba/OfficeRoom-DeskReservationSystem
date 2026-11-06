import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DraftPreview } from '@app/spaces/data/floor-plan-editor-store';
import { PlanElement, Point } from '@app/spaces/models/floor-plan';
import { boundsOf, labelAnchor } from '@app/spaces/util/plan-geometry';
import { counterScale, labelFits, Viewport } from '@app/spaces/util/viewport';

/** Label text size on screen, in px. Labels keep this size at every zoom level. */
const LABEL_FONT_PX = 13;
/** Rough glyph width at that size, used to decide whether a label fits its shape. */
const LABEL_GLYPH_PX = 7.5;
/** Thinnest a wall may look on screen, in px, however far out the view is zoomed. */
const MIN_WALL_PX = 2;

/** Renders the plan as SVG. Pure presentation: all state and interaction come from the parent. */
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

  /** Hidden when it would overflow its shape on screen; the shape keeps a <title> tooltip. */
  protected showLabel(label: string | undefined, points: readonly Point[]): boolean {
    if (!label) return false;
    const box = boundsOf(points);
    return labelFits(box.maxX - box.minX, label.length * LABEL_GLYPH_PX, this.viewport());
  }
}
