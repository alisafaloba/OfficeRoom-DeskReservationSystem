import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FloorBackgroundStore } from '@app/spaces/data/floor-background-store';
import { FloorPlanClient } from '@app/spaces/data/floor-plan-client';
import { FloorPlanEditorStore } from '@app/spaces/data/floor-plan-editor-store';
import { ResourcesClient } from '@app/spaces/data/resources-client';
import { BackgroundPanel } from '@app/spaces/ui/background-panel/background-panel';
import { CalibrationDialog } from '@app/spaces/ui/calibration-dialog/calibration-dialog';
import { DecorPalette } from '@app/spaces/ui/decor-palette/decor-palette';
import { PlanCanvas } from '@app/spaces/ui/plan-canvas/plan-canvas';
import { PlanToolbar } from '@app/spaces/ui/plan-toolbar/plan-toolbar';
import { PropertiesPanel } from '@app/spaces/ui/properties-panel/properties-panel';
import { NewResourceDraft, ResourceBinding } from '@app/spaces/ui/resource-binding/resource-binding';
import { RoomLabelDialog } from '@app/spaces/ui/room-label-dialog/room-label-dialog';
import { RESOURCE_DRAG_TYPE, UnplacedResources } from '@app/spaces/ui/unplaced-resources/unplaced-resources';
import { DecorKind, Point } from '@app/spaces/models/floor-plan';
import { backgroundBounds } from '@app/spaces/util/background-placement';
import { distance } from '@app/spaces/util/plan-geometry';
import { screenToPlan } from '@app/spaces/util/viewport';
import { Tool } from '@app/spaces/util/drawing-machine';
import { isTypingTarget, Shortcut, shortcutOf } from '@app/spaces/util/shortcuts';

/** A message under the editor header after loading or saving. */
interface Status {
  readonly kind: 'info' | 'warning' | 'error';
  readonly text: string;
}

/**
 * Admin page to draw one floor plan and link its desks and rooms to resources. Only reachable
 * through adminGuard. With a floor id (the route) it loads that floor's background, resources and
 * plan and can save; without one it is a plain in-memory drawing.
 */
@Component({
  selector: 'app-floor-plan-editor',
  imports: [
    BackgroundPanel,
    CalibrationDialog,
    DecorPalette,
    PlanCanvas,
    PlanToolbar,
    PropertiesPanel,
    ResourceBinding,
    RoomLabelDialog,
    UnplacedResources,
  ],
  providers: [FloorPlanEditorStore, FloorBackgroundStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './floor-plan-editor.html',
  host: {
    '(document:keydown)': 'onDocumentKeyDown($event)',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class FloorPlanEditor {
  protected readonly store = inject(FloorPlanEditorStore);
  protected readonly background = inject(FloorBackgroundStore);
  private readonly planClient = inject(FloorPlanClient);
  private readonly resourcesClient = inject(ResourcesClient);

  /** From the route (`/floor-plans/:floorId`). Without it, the editor works but has no background and cannot save. */
  readonly floorId = input<string>();

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly status = signal<Status | null>(null);
  /** Someone else saved since this plan was loaded: saving again would overwrite them, so offer a reload. */
  protected readonly conflict = signal(false);
  protected readonly creatingResource = signal(false);
  protected readonly createError = signal<string | null>(null);

  /** Version of the plan as loaded or last saved; null for a floor that was never saved. */
  private version: number | null = null;

  protected readonly unboundCount = computed(() => this.store.unboundShapes().length);

  constructor() {
    // One load per floor id, also when the router reuses this component for another floor
    // (only `:floorId` changes): background, resources and plan always belong to the same floor.
    effect(() => {
      const floorId = this.floorId();
      // Only the floor id triggers a load: the stores' own signals, read while loading, must not.
      if (floorId) {
        untracked(() => {
          void this.background.load(floorId);
          void this.load();
        });
      }
    });
  }

  protected readonly canvasLabel = $localize`:@@floorPlan.canvasLabel:Floor plan canvas`;

  protected readonly drawing = computed(() => this.store.tool() !== 'SELECT');

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  protected readonly zoomPercent = computed(() => Math.round(this.store.viewport().zoom * 100));

  /**
   * Loads the floor's resources and plan. Resources go in first, so bindings to deleted resources are
   * dropped when the plan opens. On another floor the old plan is cleared at once, and an answer that
   * arrives after the floor changed again is ignored: the editor never shows one floor's plan under
   * another floor's id.
   */
  protected async load(): Promise<void> {
    const floorId = this.floorId();
    if (!floorId) return;
    if (floorId !== this.loadedFloorId) {
      this.store.setResources([]);
      this.store.loadPlan([]);
      this.version = null;
      this.loadedFloorId = floorId;
    }
    this.loading.set(true);
    this.status.set(null);
    this.conflict.set(false);
    try {
      const [resources, plan] = await Promise.all([
        firstValueFrom(this.resourcesClient.list(floorId)),
        firstValueFrom(this.planClient.load(floorId)),
      ]);
      if (floorId !== this.floorId()) return;
      this.store.setResources(resources);
      this.store.loadPlan(plan.elements);
      this.version = plan.version;
    } catch {
      if (floorId !== this.floorId()) return;
      this.status.set({ kind: 'error', text: $localize`:@@floorPlan.loadFailed:Could not load the floor plan.` });
    } finally {
      if (floorId === this.floorId()) this.loading.set(false);
    }
  }

  /** The floor whose plan the store holds, to tell a reload from a switch to another floor. */
  private loadedFloorId: string | null = null;

  /** Throws away local changes after asking, and opens the plan as it is stored now. */
  protected async reload(): Promise<void> {
    if (this.store.dirty() && !window.confirm(this.discardQuestion)) return;
    await this.load();
  }

  /**
   * Saves the plan with the version it was loaded at. Desk and room shapes without a resource do not
   * block the save; the admin is told how many there are.
   */
  protected async save(): Promise<boolean> {
    const floorId = this.floorId();
    if (!floorId || this.saving() || this.loading()) return false;
    const elements = this.store.elements();
    const unbound = this.unboundCount();
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.planClient.save(floorId, this.version, elements));
      this.version = saved.version;
      this.store.markSaved(elements);
      this.conflict.set(false);
      this.status.set(
        unbound === 0
          ? { kind: 'info', text: $localize`:@@floorPlan.saved:Plan saved.` }
          : {
              kind: 'warning',
              text:
                unbound === 1
                  ? $localize`:@@floorPlan.savedUnboundOne:Plan saved. 1 desk or room is not linked to a resource yet.`
                  : $localize`:@@floorPlan.savedUnboundMany:Plan saved. ${unbound}:count: desks or rooms are not linked to a resource yet.`,
            },
      );
      return true;
    } catch (error) {
      this.status.set({ kind: 'error', text: this.saveErrorText(error) });
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Creates a resource from the form of an unbound shape and binds the shape to it. */
  protected async createResource(draft: NewResourceDraft): Promise<void> {
    const floorId = this.floorId();
    const binding = this.store.binding();
    if (!binding) return;
    if (!floorId) {
      this.createError.set($localize`:@@floorPlan.createNoFloor:Open the plan from a floor to create resources.`);
      return;
    }
    this.creatingResource.set(true);
    this.createError.set(null);
    try {
      const created = await firstValueFrom(
        this.resourcesClient.create(floorId, {
          name: draft.name,
          type: binding.resourceType,
          capacity: binding.resourceType === 'MEETING_ROOM' ? draft.capacity : 1,
          notes: null,
          equipmentIds: [],
        }),
      );
      this.store.addResource(created);
      this.store.bindSelected(created.id);
    } catch (error) {
      this.createError.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? $localize`:@@floorPlan.createNameTaken:This floor already has a resource with this label.`
          : $localize`:@@floorPlan.createFailed:Could not create the resource.`,
      );
    } finally {
      this.creatingResource.set(false);
    }
  }

  /** Keyboard alternative to dragging: drops the resource in the middle of the view. */
  protected placeInView(resourceId: string): void {
    const { width, height } = this.canvasSize();
    this.store.placeResource(resourceId, { x: width / 2, y: height / 2 });
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(RESOURCE_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(event: DragEvent): void {
    const resourceId = event.dataTransfer?.getData(RESOURCE_DRAG_TYPE);
    if (!resourceId) return;
    event.preventDefault();
    const rect = this.frame().nativeElement.getBoundingClientRect();
    this.store.placeResource(resourceId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  /** For the route's canDeactivate: leaving with unsaved changes needs a confirmation. */
  canLeave(): boolean {
    return !this.store.dirty() || window.confirm(this.discardQuestion);
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty()) event.preventDefault();
  }

  private readonly discardQuestion = $localize`:@@floorPlan.discard:The plan has unsaved changes. Discard them?`;

  private saveErrorText(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        this.conflict.set(true);
        return $localize`:@@floorPlan.saveConflict:Someone else saved this plan in the meantime. Reload it to see their changes; yours are not saved.`;
      }
      const code: unknown = error.error?.code;
      if (code === 'FLOOR_PLAN_RESOURCE_ALREADY_PLACED') {
        return $localize`:@@floorPlan.saveDuplicate:A resource is linked to more than one shape. Unlink one of them and save again.`;
      }
      if (code === 'FLOOR_PLAN_RESOURCE_INVALID') {
        return $localize`:@@floorPlan.saveInvalidResource:A shape is linked to a resource that is no longer on this floor. Reload the plan and save again.`;
      }
      if (error.status === 400) {
        return $localize`:@@floorPlan.saveInvalid:The plan could not be saved because it is not valid.`;
      }
    }
    return $localize`:@@floorPlan.saveFailed:Could not save the plan.`;
  }

  /** One button press zooms by this factor; going in and out lands on the same level again. */
  private static readonly ZOOM_STEP = 1.25;

  protected zoomIn(): void {
    this.zoomBy(FloorPlanEditor.ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.zoomBy(1 / FloorPlanEditor.ZOOM_STEP);
  }

  protected fit(): void {
    const { width, height } = this.canvasSize();
    const layer = this.background.layer();
    this.store.fitToScreen(width, height, layer ? backgroundBounds(layer) : null);
  }

  // While the background is calibrated or moved, the canvas pointer works on it, not on the plan.

  protected onPointerDown(at: Point, shift: boolean): void {
    if (this.background.mode() === 'idle') this.store.pointerDown(at, shift);
    else this.background.pointerDown(this.toPlan(at));
  }

  protected onPointerMove(at: Point, shift: boolean): void {
    if (this.background.mode() === 'idle') this.store.pointerMove(at, shift);
    else this.background.pointerMove(this.toPlan(at));
  }

  protected onPointerUp(at: Point, repeat: boolean): void {
    if (this.background.mode() === 'idle') this.store.pointerUp(at, repeat);
    else this.background.pointerUp();
  }

  protected onPointerCancel(): void {
    if (this.background.mode() === 'idle') this.store.pointerCancel();
    else this.background.pointerCancel();
  }

  protected onCanvasKey(key: string): void {
    if (this.background.mode() !== 'idle') {
      if (key === 'Escape' || key === 'Enter') this.background.cancelMode();
      return;
    }
    this.store.keyDown(key);
  }

  /** A tool chosen while the background is adjusted ends that first. */
  protected chooseTool(tool: Tool): void {
    this.background.cancelMode();
    this.store.chooseTool(tool);
  }

  protected chooseDecor(kind: DecorKind): void {
    this.background.cancelMode();
    this.store.chooseDecor(kind);
  }

  /** The two calibration points' distance at the current scale, for the dialog. */
  protected readonly calibrationDistance = computed(() => {
    const [a, b] = this.background.calibrationMarks();
    return a && b ? distance(a, b) : 0;
  });

  private toPlan(screen: Point): Point {
    return screenToPlan(this.store.viewport(), screen);
  }

  private zoomBy(factor: number): void {
    const { width, height } = this.canvasSize();
    this.store.zoomStep(factor, width, height);
  }

  private canvasSize(): { width: number; height: number } {
    const { clientWidth, clientHeight } = this.frame().nativeElement;
    return { width: clientWidth, height: clientHeight };
  }

  private readonly hints: Record<Tool, string> = {
    SELECT: $localize`:@@floorPlan.hint.select:Click an element or drag a box to select, drag to move, use the handles to resize and rotate (Shift snaps to 15°). Delete removes, Ctrl+C / Ctrl+V copies, Ctrl+Z / Ctrl+Y undoes and redoes. Scroll to zoom, hold Space or the middle button and drag to pan.`,
    WALL: $localize`:@@floorPlan.hint.wall:Click to add points. Double-click or Enter finishes, Backspace removes the last point, Esc cancels.`,
    OUTLINE: $localize`:@@floorPlan.hint.outline:Click to add corners of the floor outline. Double-click or Enter closes it, Esc cancels.`,
    ZONE: $localize`:@@floorPlan.hint.zone:Drag a rectangle, or click points for a polygon. Double-click or Enter finishes, Esc cancels.`,
    ROOM: $localize`:@@floorPlan.hint.room:Drag a rectangle, or click points for a polygon, then name the room. Esc cancels.`,
    DESK: $localize`:@@floorPlan.hint.desk:Click to place a desk.`,
    DECOR: $localize`:@@floorPlan.hint.decor:Click to place the chosen element.`,
    PHONE_BOOTH: $localize`:@@floorPlan.hint.phoneBooth:Click to place a phone booth (bookable).`,
    PARKING_SPOT: $localize`:@@floorPlan.hint.parkingSpot:Click to place a parking spot (bookable).`,
    BREAK_ROOM: $localize`:@@floorPlan.hint.breakRoom:Drag a rectangle, or click points for a polygon, then name the break room (shown on map only, not bookable). Esc cancels.`,
  };

  private readonly backgroundHints = {
    calibrating: $localize`:@@floorPlan.hint.calibrate:Click two points on the background whose real distance you know, e.g. both ends of a dimensioned wall. Esc cancels.`,
    moving: $localize`:@@floorPlan.hint.moveBackground:Drag to move the background into line with the drawing. Esc, Enter or Done finishes.`,
  };

  protected readonly hint = computed(() => {
    const mode = this.background.mode();
    return mode === 'idle' ? this.hints[this.store.tool()] : this.backgroundHints[mode];
  });

  protected readonly breakRoomDialogTitle = $localize`:@@breakRoomLabel.title:Name the break room`;
  protected readonly breakRoomSaveLabel = $localize`:@@breakRoomLabel.save:Add break room`;

  /**
   * Editing shortcuts work wherever the focus is on the page, except in a field: there the keys belong
   * to the text (native undo, copy, paste). The canvas already handles Delete itself and marks it done.
   */
  protected onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTypingTarget(event.target) || this.store.pendingRoom() !== null || this.store.pendingBreakRoom() !== null) return;
    if (this.background.mode() !== 'idle') {
      // Esc ends calibrating or moving from anywhere on the page; plan shortcuts wait meanwhile.
      if (event.key === 'Escape') this.background.cancelMode();
      return;
    }
    if (event.key === 'Delete') {
      this.store.keyDown('Delete');
      return;
    }
    const shortcut = shortcutOf(event);
    // With page text selected, Ctrl+C is the browser's copy, not the plan's.
    if (shortcut === null || (shortcut === 'copy' && hasTextSelected())) return;
    // Only take the key when the action happened; otherwise the browser keeps it.
    if (this.runShortcut(shortcut)) event.preventDefault();
  }

  private runShortcut(shortcut: Shortcut): boolean {
    switch (shortcut) {
      case 'undo':
        return this.store.undo();
      case 'redo':
        return this.store.redo();
      case 'copy':
        return this.store.copySelection();
      case 'paste':
        return this.store.paste();
      case 'save':
        // Ctrl+S always belongs to the editor here, even with nothing to save: the browser's "save page" is no use.
        void this.save();
        return true;
    }
  }
}

const hasTextSelected = (): boolean => (window.getSelection()?.toString() ?? '') !== '';
