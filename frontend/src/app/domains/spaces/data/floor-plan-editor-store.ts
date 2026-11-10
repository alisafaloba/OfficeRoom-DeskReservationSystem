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
import { canRedo, canUndo, commitFrom, createHistory, History, record, redo, setPresent, undo } from '@app/spaces/util/history';
import { distance, hitTest, inDrawOrder, rectPoints } from '@app/spaces/util/plan-geometry';
import {
  applyFrame,
  boundsFrame,
  containsBounds,
  copyOf,
  elementBounds,
  Frame,
  frameOf,
  isPlaced,
  MIN_SIZE,
  translate,
  unionBounds,
} from '@app/spaces/util/plan-transform';
import {
  Corner,
  hitHandle,
  overlayFor,
  resizeByCorner,
  rotateTo,
  SelectionOverlay,
} from '@app/spaces/util/selection-handles';
import { newId } from '@app/spaces/util/uuid';
import { INITIAL_VIEWPORT, panBy, screenToPlan, Viewport, zoomAt } from '@app/spaces/util/viewport';

/** What is being drawn right now, for the canvas to render with the draft style. */
export interface DraftPreview {
  readonly tool: Tool;
  readonly points: readonly Point[];
  /** A drag rectangle is a closed shape; a click-by-click draft is an open path to the cursor. */
  readonly shape: 'rectangle' | 'path';
}

/** A value the admin typed into the properties panel. */
export interface PropertyChange {
  readonly field: 'x' | 'y' | 'width' | 'height' | 'angle';
  readonly value: number;
}

/** What the properties panel shows for a single selected element; `angle` is null when it cannot rotate. */
export interface SelectionProperties {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number | null;
}

type Elements = readonly PlanElement[];

/** A pointer gesture in the select tool; it records one undo step when it ends. */
type Gesture =
  | {
      readonly kind: 'move';
      readonly origin: Point;
      readonly base: Elements;
      readonly ids: ReadonlySet<string>;
      /** Plain click on part of a multi-selection (no drag): narrows the selection to it. */
      readonly clicked: string | null;
      readonly shift: boolean;
      moved: boolean;
    }
  | {
      readonly kind: 'resize' | 'rotate';
      readonly origin: Point;
      readonly base: Elements;
      readonly id: string;
      readonly frame: Frame;
      readonly corner: Corner | null;
    }
  | {
      readonly kind: 'marquee';
      readonly origin: Point;
      readonly additive: boolean;
      /** A zone or room under the press: a click selects it, a drag draws the box instead of moving it. */
      readonly backdrop: string | null;
      dragging: boolean;
    };

const isBackdrop = (elements: Elements, id: string): boolean => {
  const type = elements.find((element) => element.id === id)?.type;
  return type === 'ZONE' || type === 'ROOM';
};

/** Screen pixels a press must travel before it counts as a drag rather than a click. */
const DRAG_PX = 4;
/** Each paste lands this far (plan units) from the previous one, so copies never hide each other. */
const PASTE_OFFSET = 100;

/**
 * Editor state for one floor plan: the elements (in plan units), the active tool, the drawing
 * in progress, the selection and the viewport. Provided per editor page, so it is gone when
 * the admin leaves. Every pointer method takes screen coordinates relative to the canvas.
 */
@Injectable()
export class FloorPlanEditorStore {
  private readonly _history = signal<History<Elements>>(createHistory<Elements>([]));
  private readonly _draw = signal<DrawState>(initialDrawState());
  private readonly _selection = signal<ReadonlySet<string>>(new Set());
  private readonly _marquee = signal<{ readonly origin: Point; readonly current: Point } | null>(null);
  private readonly _viewport = signal<Viewport>(INITIAL_VIEWPORT);
  private readonly _pendingRoom = signal<readonly Point[] | null>(null);

  private readonly _elements = computed(() => this._history().present);

  private repeatClick = false;
  private gesture: Gesture | null = null;
  private clipboard: Elements = [];
  private pasteCount = 0;

  readonly elements = this._elements;
  readonly viewport = this._viewport.asReadonly();
  readonly selectedIds = this._selection.asReadonly();
  readonly canUndo = computed(() => canUndo(this._history()));
  readonly canRedo = computed(() => canRedo(this._history()));
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

  /** The selection box and its handles; only in the select tool, and only while no box is being drawn. */
  readonly overlay = computed<SelectionOverlay | null>(() => {
    if (this.tool() !== 'SELECT' || this._marquee() !== null) return null;
    const selected = this.selected();
    if (selected.length === 0) return null;
    const zoom = this._viewport().zoom;
    if (selected.length === 1) {
      return overlayFor(frameOf(selected[0]), { resizable: true, rotatable: isPlaced(selected[0]) }, zoom);
    }
    const frame = boundsFrame(unionBounds(selected.map(elementBounds)));
    return overlayFor(frame, { resizable: false, rotatable: false }, zoom);
  });

  /** The rubber band of a selection box being dragged, as four corners. */
  readonly marquee = computed<readonly Point[] | null>(() => {
    const box = this._marquee();
    return box ? rectPoints(box.origin, box.current) : null;
  });

  /** Values for the properties panel: only when exactly one element is selected. */
  readonly properties = computed<SelectionProperties | null>(() => {
    const selected = this.selected();
    if (selected.length !== 1) return null;
    const frame = frameOf(selected[0]);
    const shown = (value: number) => Math.round(value * 10) / 10;
    return {
      x: shown(frame.center.x),
      y: shown(frame.center.y),
      width: shown(frame.width),
      height: shown(frame.height),
      angle: isPlaced(selected[0]) ? frame.rotation : null,
    };
  });

  private readonly selected = computed(() => {
    const ids = this._selection();
    return this._elements().filter((element) => ids.has(element.id));
  });

  chooseTool(tool: Tool): void {
    this.cancelGesture();
    this._selection.set(new Set());
    this._draw.update((state) => selectTool(state, tool));
  }

  chooseDecor(kind: DecorKind): void {
    this.cancelGesture();
    this._selection.set(new Set());
    this._draw.update((state) => selectTool(state, 'DECOR', kind));
  }

  /** `shift` adds to the selection while selecting, and snaps rotation to 15 degree steps. */
  pointerDown(screen: Point, shift = false): void {
    if (this.tool() === 'SELECT') {
      if (this._pendingRoom() === null) this.beginGesture(this.input(screen), shift);
      return;
    }
    this.run((state) => pointerDown(state, this.input(screen)));
  }

  pointerMove(screen: Point, shift = false): void {
    if (this.gesture) {
      this.dragGesture(this.input(screen), shift);
      return;
    }
    this.run((state) => pointerMove(state, this.input(screen)));
  }

  /** `repeatClick` is the second click of a double-click: it must not place another desk or decor element. */
  pointerUp(screen: Point, repeatClick = false): void {
    if (this.tool() === 'SELECT') {
      this.endGesture(this.input(screen));
      return;
    }
    this.repeatClick = repeatClick;
    try {
      this.run((state) => pointerUp(state, this.input(screen)));
    } finally {
      this.repeatClick = false;
    }
  }

  pointerCancel(): void {
    this.cancelGesture();
    this.run((state) => pointerCancel(state));
  }

  doubleClick(): void {
    this.run((state) => doubleClick(state));
  }

  keyDown(key: string): void {
    if (this._pendingRoom() !== null) return;
    if (key === 'Escape' && this.tool() === 'SELECT') {
      // Escape first abandons a drag, then drops the selection, then (in the machine) does nothing more.
      if (this.gesture) return this.cancelGesture();
      if (this._selection().size > 0) return this._selection.set(new Set());
    }
    this.run((state) => keyDown(state, key));
  }

  undo(): void {
    this.step(undo);
  }

  redo(): void {
    this.step(redo);
  }

  /** Remembers the selected elements for `paste`. */
  copySelection(): void {
    const copied = this.selected();
    if (copied.length === 0) return;
    this.clipboard = copied;
    this.pasteCount = 0;
  }

  /**
   * Adds copies of the copied elements, shifted so they do not sit on the originals, and selects them.
   * Copies get new ids and only their geometry, so a pasted desk is never tied to the original's resource.
   */
  paste(): void {
    if (this.clipboard.length === 0 || this._pendingRoom() !== null) return;
    this.cancelGesture();
    this.pasteCount += 1;
    const offset = PASTE_OFFSET * this.pasteCount;
    const copies = this.clipboard.map((element) => copyOf(element, newId(), offset, offset));
    this.commit([...this._elements(), ...copies]);
    this._draw.update((state) => selectTool(state, 'SELECT'));
    this._selection.set(new Set(copies.map((copy) => copy.id)));
  }

  deleteSelection(): void {
    const ids = this._selection();
    if (ids.size === 0) return;
    this.commit(this._elements().filter((element) => !ids.has(element.id)));
    this._selection.set(new Set());
  }

  /** One undo step per edit, however many fields it changes. */
  editSelected(change: PropertyChange): void {
    const [element, ...rest] = this.selected();
    if (!element || rest.length > 0 || !Number.isFinite(change.value)) return;
    const frame = frameOf(element);
    let next: Frame;
    switch (change.field) {
      case 'x':
        next = { ...frame, center: { ...frame.center, x: change.value } };
        break;
      case 'y':
        next = { ...frame, center: { ...frame.center, y: change.value } };
        break;
      case 'width':
        next = { ...frame, width: Math.max(MIN_SIZE, change.value) };
        break;
      case 'height':
        next = { ...frame, height: Math.max(MIN_SIZE, change.value) };
        break;
      case 'angle':
        if (!isPlaced(element)) return;
        next = { ...frame, rotation: change.value };
        break;
    }
    const edited = applyFrame(element, next);
    if (JSON.stringify(edited) === JSON.stringify(element)) return;
    this.commit(this._elements().map((candidate) => (candidate.id === element.id ? edited : candidate)));
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
      case 'deleteSelected':
        this.deleteSelection();
        break;
    }
  }

  private add(element: NewElement): void {
    if (this.repeatClick && (element.type === 'DESK' || element.type === 'DECOR')) return;
    this.commit([...this._elements(), { ...element, id: newId() } as PlanElement]);
  }

  /** Every change that is not a live drag frame goes through here, so it can be undone. */
  private commit(next: Elements): void {
    this._history.update((history) => record(history, next));
  }

  private step(move: (history: History<Elements>) => History<Elements>): void {
    if (this.gesture || this._pendingRoom() !== null) return;
    this._history.update(move);
    // What was selected may no longer exist after the step.
    const present = new Set(this._elements().map((element) => element.id));
    this._selection.update((ids) => new Set(Array.from(ids).filter((id) => present.has(id))));
  }

  private beginGesture({ point, zoom }: { point: Point; zoom: number }, shift: boolean): void {
    const base = this._elements();
    const overlay = this.overlay();
    const handle = overlay ? hitHandle(overlay, point, zoom) : null;
    const [only] = this.selected();
    if (handle && only && this._selection().size === 1) {
      this.gesture = {
        kind: handle === 'rotate' ? 'rotate' : 'resize',
        origin: point,
        base,
        id: only.id,
        frame: frameOf(only),
        corner: handle === 'rotate' ? null : handle,
      };
      return;
    }
    const hit = hitTest(base, point, zoom);
    const selected = hit !== null && this._selection().has(hit);
    // Rooms and zones sit behind everything else, so dragging on one boxes in what is inside it. Click
    // it first to select it, then drag to move it.
    const backdrop = hit !== null && !selected && isBackdrop(base, hit);
    if (hit === null || backdrop) {
      this.gesture = { kind: 'marquee', origin: point, additive: shift, backdrop: hit, dragging: false };
      return;
    }
    if (!selected) {
      this._selection.set(shift ? new Set([...this._selection(), hit]) : new Set([hit]));
    }
    this.gesture = {
      kind: 'move',
      origin: point,
      base,
      ids: this._selection(),
      clicked: selected ? hit : null,
      shift,
      moved: false,
    };
  }

  private dragGesture({ point, zoom }: { point: Point; zoom: number }, shift: boolean): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const traveled = distance(gesture.origin, point) * zoom;
    switch (gesture.kind) {
      case 'move': {
        if (!gesture.moved && traveled <= DRAG_PX) return;
        gesture.moved = true;
        const dx = Math.round(point.x - gesture.origin.x);
        const dy = Math.round(point.y - gesture.origin.y);
        this.showFrame(gesture.base.map((element) => (gesture.ids.has(element.id) ? translate(element, dx, dy) : element)));
        break;
      }
      case 'resize':
      case 'rotate': {
        const next =
          gesture.kind === 'resize' && gesture.corner
            ? resizeByCorner(gesture.frame, gesture.corner, point)
            : rotateTo(gesture.frame, gesture.origin, point, shift);
        this.showFrame(gesture.base.map((element) => (element.id === gesture.id ? applyFrame(element, next) : element)));
        break;
      }
      case 'marquee':
        if (!gesture.dragging && traveled <= DRAG_PX) return;
        gesture.dragging = true;
        this._marquee.set({ origin: gesture.origin, current: point });
        break;
    }
  }

  private endGesture({ point }: { point: Point; zoom: number }): void {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;
    switch (gesture.kind) {
      case 'move':
        if (gesture.moved) {
          this._history.update((history) => commitFrom(history, gesture.base));
        } else if (gesture.clicked !== null) {
          // A click, not a drag, on a selected element: toggle it out with Shift, else narrow to it.
          const ids = new Set(this._selection());
          if (gesture.shift) ids.delete(gesture.clicked);
          else {
            ids.clear();
            ids.add(gesture.clicked);
          }
          this._selection.set(ids);
        }
        break;
      case 'resize':
      case 'rotate':
        this._history.update((history) => commitFrom(history, gesture.base));
        break;
      case 'marquee': {
        this._marquee.set(null);
        if (!gesture.dragging) {
          const ids = new Set(gesture.additive ? this._selection() : []);
          if (gesture.backdrop !== null) ids.add(gesture.backdrop);
          this._selection.set(ids);
          break;
        }
        const [a, , c] = rectPoints(gesture.origin, point);
        const box = { minX: a.x, minY: a.y, maxX: c.x, maxY: c.y };
        // Fully inside the box: a room or zone behind the desks you box in is not swept up with them.
        const inside = this._elements().filter((element) => containsBounds(box, elementBounds(element)));
        const ids = new Set(gesture.additive ? this._selection() : []);
        for (const element of inside) ids.add(element.id);
        this._selection.set(ids);
        break;
      }
    }
  }

  /** Drops a drag in progress and puts the plan back as it was before it. */
  private cancelGesture(): void {
    const gesture = this.gesture;
    this.gesture = null;
    this._marquee.set(null);
    if (gesture && gesture.kind !== 'marquee') this._history.update((history) => setPresent(history, gesture.base));
  }

  /** A live frame of a drag: shown at once, recorded as one undo step only when the drag ends. */
  private showFrame(next: Elements): void {
    this._history.update((history) => setPresent(history, next));
  }
}
