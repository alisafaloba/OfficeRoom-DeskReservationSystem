import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FloorPlanEditorStore } from '@app/spaces/data/floor-plan-editor-store';
import { DecorPalette } from '@app/spaces/ui/decor-palette/decor-palette';
import { PlanCanvas } from '@app/spaces/ui/plan-canvas/plan-canvas';
import { PlanToolbar } from '@app/spaces/ui/plan-toolbar/plan-toolbar';
import { PropertiesPanel } from '@app/spaces/ui/properties-panel/properties-panel';
import { RoomLabelDialog } from '@app/spaces/ui/room-label-dialog/room-label-dialog';
import { Tool } from '@app/spaces/util/drawing-machine';
import { isTypingTarget, shortcutOf } from '@app/spaces/util/shortcuts';

/** Admin page to draw one floor plan. Only reachable through adminGuard. */
@Component({
  selector: 'app-floor-plan-editor',
  imports: [DecorPalette, PlanCanvas, PlanToolbar, PropertiesPanel, RoomLabelDialog],
  providers: [FloorPlanEditorStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './floor-plan-editor.html',
  host: { '(document:keydown)': 'onDocumentKeyDown($event)' },
})
export class FloorPlanEditor {
  protected readonly store = inject(FloorPlanEditorStore);

  protected readonly canvasLabel = $localize`:@@floorPlan.canvasLabel:Floor plan canvas`;

  protected readonly drawing = computed(() => this.store.tool() !== 'SELECT');

  private readonly hints: Record<Tool, string> = {
    SELECT: $localize`:@@floorPlan.hint.select:Click an element or drag a box to select, drag to move, use the handles to resize and rotate (Shift snaps to 15°). Delete removes, Ctrl+C / Ctrl+V copies, Ctrl+Z / Ctrl+Y undoes and redoes. Scroll to zoom, hold Space or the middle button and drag to pan.`,
    WALL: $localize`:@@floorPlan.hint.wall:Click to add points. Double-click or Enter finishes, Backspace removes the last point, Esc cancels.`,
    OUTLINE: $localize`:@@floorPlan.hint.outline:Click to add corners of the floor outline. Double-click or Enter closes it, Esc cancels.`,
    ZONE: $localize`:@@floorPlan.hint.zone:Drag a rectangle, or click points for a polygon. Double-click or Enter finishes, Esc cancels.`,
    ROOM: $localize`:@@floorPlan.hint.room:Drag a rectangle, or click points for a polygon, then name the room. Esc cancels.`,
    DESK: $localize`:@@floorPlan.hint.desk:Click to place a desk.`,
    DECOR: $localize`:@@floorPlan.hint.decor:Click to place the chosen element.`,
  };

  protected readonly hint = computed(() => this.hints[this.store.tool()]);

  /**
   * Editing shortcuts work wherever the focus is on the page, except in a field: there the keys belong
   * to the text (native undo, copy, paste). The canvas already handles Delete itself and marks it done.
   */
  protected onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTypingTarget(event.target) || this.store.pendingRoom() !== null) return;
    if (event.key === 'Delete') {
      this.store.keyDown('Delete');
      return;
    }
    const shortcut = shortcutOf(event);
    if (shortcut === null) return;
    event.preventDefault();
    switch (shortcut) {
      case 'undo':
        this.store.undo();
        break;
      case 'redo':
        this.store.redo();
        break;
      case 'copy':
        this.store.copySelection();
        break;
      case 'paste':
        this.store.paste();
        break;
    }
  }
}
