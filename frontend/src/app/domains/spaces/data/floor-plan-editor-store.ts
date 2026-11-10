import { computed, Injectable, signal } from '@angular/core';
import { DecorKind, NewElement, PlanElement, Point } from '@app/spaces/models/floor-plan';
import {
  doubleClick,
  DrawEffect,
  DrawState,
  initialDrawState,
  keyDown,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  selectTool,
  Step,
  Tool,
} from '@app/spaces/util/drawing-machine';
import { elementsBounds, hitTest, inDrawOrder, rectPoints } from '@app/spaces/util/plan-geometry';
import { newId } from '@app/spaces/util/uuid';
import { fitToBounds, INITIAL_VIEWPORT, panBy, screenToPlan, Viewport, zoomAt } from '@app/spaces/util/viewport';

/** What is being drawn right now, for the canvas to render with the draft style. */
export interface DraftPreview {
  readonly tool: Tool;
  readonly points: readonly Point[];
  /** A drag rectangle is a closed shape; a click-by-click draft is an open path to the cursor. */
  readonly shape: 'rectangle' | 'path';
}

/**
 * Editor state for one floor plan: the elements (in plan units), the active tool, the drawing
 * in progress, the selection and the viewport. Provided per editor page, so it is gone when
 * the admin leaves. Every pointer method takes screen coordinates relative to the canvas.
 */
@Injectable()
export class FloorPlanEditorStore {
  private readonly _elements = signal<readonly PlanElement[]>([]);
  private readonly _draw = signal<DrawState>(initialDrawState());
  private readonly _selectedId = signal<string | null>(null);
  private readonly _viewport = signal<Viewport>(INITIAL_VIEWPORT);
  private readonly _pendingRoom = signal<readonly Point[] | null>(null);

  private repeatClick = false;

  readonly elements = this._elements.asReadonly();
  readonly viewport = this._viewport.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  /** Points of a room waiting for its label; non-null while the label dialog is open. */
  readonly pendingRoom = this._pendingRoom.asReadonly();

  readonly tool = computed(() => this._draw().tool);
  readonly decorKind = computed(() => this._draw().decorKind);
  readonly orderedElements = computed(() => inDrawOrder(this._elements()));

  readonly preview = computed<DraftPreview | null>(() => {
    const { tool, points, press, cursor } = this._draw();
    if (press?.dragging && points.length === 0 && (tool === 'ZONE' || tool === 'ROOM')) {
      return { tool, points: rectPoints(press.origin, press.current), shape: 'rectangle' };
    }
    if (points.length === 0) return null;
    return { tool, points: cursor ? [...points, cursor] : points, shape: 'path' };
  });

  chooseTool(tool: Tool): void {
    this._selectedId.set(null);
    this._draw.update((state) => selectTool(state, tool));
  }

  chooseDecor(kind: DecorKind): void {
    this._selectedId.set(null);
    this._draw.update((state) => selectTool(state, 'DECOR', kind));
  }

  pointerDown(screen: Point): void {
    this.run((state) => pointerDown(state, this.input(screen)));
  }

  pointerMove(screen: Point): void {
    this.run((state) => pointerMove(state, this.input(screen)));
  }

  /** `repeatClick` is the second click of a double-click: it must not place another desk or decor element. */
  pointerUp(screen: Point, repeatClick = false): void {
    this.repeatClick = repeatClick;
    try {
      this.run((state) => pointerUp(state, this.input(screen)));
    } finally {
      this.repeatClick = false;
    }
  }

  pointerCancel(): void {
    this.run((state) => pointerCancel(state));
  }

  doubleClick(): void {
    this.run((state) => doubleClick(state));
  }

  keyDown(key: string): void {
    if (this._pendingRoom() !== null) return;
    this.run((state) => keyDown(state, key));
  }

  confirmRoom(label: string): void {
    const points = this._pendingRoom();
    const trimmed = label.trim();
    if (points === null || trimmed === '') return;
    this.add({ type: 'ROOM', points, label: trimmed });
    this._pendingRoom.set(null);
  }

  cancelRoom(): void {
    this._pendingRoom.set(null);
  }

  zoomAt(screen: Point, factor: number): void {
    this._viewport.update((viewport) => zoomAt(viewport, screen, factor));
  }

  panBy(dx: number, dy: number): void {
    this._viewport.update((viewport) => panBy(viewport, dx, dy));
  }

  /** Zooms and pans so the whole plan fills a canvas of the given size; an empty plan returns to the start view. */
  fitToScreen(width: number, height: number): void {
    const bounds = elementsBounds(this._elements());
    this._viewport.set(bounds ? fitToBounds(bounds, width, height) : INITIAL_VIEWPORT);
  }

  private input(screen: Point): { point: Point; zoom: number } {
    const viewport = this._viewport();
    return { point: screenToPlan(viewport, screen), zoom: viewport.zoom };
  }

  private run(transition: (state: DrawState) => Step): void {
    const step = transition(this._draw());
    this._draw.set(step.state);
    if (step.effect) this.apply(step.effect);
  }

  private apply(effect: DrawEffect): void {
    switch (effect.type) {
      case 'commit':
        this.add(effect.element);
        break;
      case 'requestRoomLabel':
        this._pendingRoom.set(effect.points);
        break;
      case 'select':
        this._selectedId.set(hitTest(this._elements(), effect.point, effect.zoom));
        break;
      case 'deleteSelected': {
        const id = this._selectedId();
        if (id === null) break;
        this._elements.update((elements) => elements.filter((element) => element.id !== id));
        this._selectedId.set(null);
        break;
      }
    }
  }

  private add(element: NewElement): void {
    if (this.repeatClick && (element.type === 'DESK' || element.type === 'DECOR')) return;
    this._elements.update((elements) => [...elements, { ...element, id: newId() } as PlanElement]);
  }
}
