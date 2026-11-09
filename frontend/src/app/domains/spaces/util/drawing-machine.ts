import { DecorKind, NewElement, PLAN_DEFAULTS, Point } from '@app/spaces/models/floor-plan';
import { distance, rectPoints, roundPoint } from './plan-geometry';

export type Tool = 'SELECT' | 'WALL' | 'OUTLINE' | 'ZONE' | 'ROOM' | 'DESK' | 'DECOR';

export const TOOLS: readonly Tool[] = ['SELECT', 'WALL', 'OUTLINE', 'ZONE', 'ROOM', 'DESK', 'DECOR'];

/** Screen-pixel tolerances; converted to plan units with the zoom of each event. */
const DRAG_PX = 4;
const DUPLICATE_PX = 3;
const CLOSE_PX = 8;

export interface DrawState {
  readonly tool: Tool;
  readonly decorKind: DecorKind;
  /** Points of the shape being drawn click by click. */
  readonly points: readonly Point[];
  /** Pointer held down: it becomes a rectangle drag once it moved far enough. */
  readonly press: { readonly origin: Point; readonly current: Point; readonly dragging: boolean } | null;
  /** Last pointer position, for the rubber-band segment. */
  readonly cursor: Point | null;
}

export type DrawEffect =
  | { readonly type: 'commit'; readonly element: NewElement }
  | { readonly type: 'requestRoomLabel'; readonly points: readonly Point[] }
  | { readonly type: 'select'; readonly point: Point; readonly zoom: number }
  | { readonly type: 'deleteSelected' };

export interface Step {
  readonly state: DrawState;
  readonly effect?: DrawEffect;
}

export interface PointerInput {
  /** Position in plan units. */
  readonly point: Point;
  readonly zoom: number;
}

export const initialDrawState = (tool: Tool = 'SELECT', decorKind: DecorKind = 'DOOR'): DrawState => ({
  tool,
  decorKind,
  points: [],
  press: null,
  cursor: null,
});

/** Switching tool abandons any drawing in progress. */
export function selectTool(state: DrawState, tool: Tool, decorKind: DecorKind = state.decorKind): DrawState {
  return { ...initialDrawState(tool, decorKind), cursor: state.cursor };
}

export const isDrawing = (state: DrawState): boolean => state.points.length > 0 || state.press?.dragging === true;

const isPolygonTool = (tool: Tool): boolean => tool === 'OUTLINE' || tool === 'ZONE' || tool === 'ROOM';
const isRectangleTool = (tool: Tool): boolean => tool === 'ZONE' || tool === 'ROOM';
const isLineTool = (tool: Tool): boolean => tool === 'WALL' || isPolygonTool(tool);

export function pointerDown(state: DrawState, { point }: PointerInput): Step {
  if (!isLineTool(state.tool)) return { state };
  const p = roundPoint(point);
  return { state: { ...state, press: { origin: p, current: p, dragging: false }, cursor: p } };
}

export function pointerMove(state: DrawState, { point, zoom }: PointerInput): Step {
  const p = roundPoint(point);
  const press = state.press;
  if (!press) return { state: { ...state, cursor: p } };
  const dragging = press.dragging || distance(press.origin, p) * zoom > DRAG_PX;
  return { state: { ...state, cursor: p, press: { ...press, current: p, dragging } } };
}

export function pointerUp(state: DrawState, input: PointerInput): Step {
  const p = roundPoint(input.point);
  const { zoom } = input;
  const press = state.press;
  const released: DrawState = { ...state, press: null, cursor: p };

  switch (state.tool) {
    case 'SELECT':
      return { state: released, effect: { type: 'select', point: p, zoom } };
    case 'DESK':
      return { state: released, effect: commitPlaced('DESK', p, PLAN_DEFAULTS.desk) };
    case 'DECOR':
      return { state: released, effect: commitPlaced('DECOR', p, PLAN_DEFAULTS.decor[state.decorKind], state.decorKind) };
    default:
      break;
  }

  if (!press) return { state: released };
  if (press.dragging && isRectangleTool(state.tool) && state.points.length === 0) {
    const [a, , c] = rectPoints(press.origin, p);
    if ((c.x - a.x) * zoom > DRAG_PX && (c.y - a.y) * zoom > DRAG_PX) {
      return finish({ ...released, points: rectPoints(press.origin, p) });
    }
  }
  return addPoint(released, p, zoom);
}

/** The browser took the pointer away (e.g. a touch became a scroll): drop the press without acting on it. */
export function pointerCancel(state: DrawState): Step {
  return { state: { ...state, press: null } };
}

/** Double-click finishes the line or polygon. The double-click's own clicks are already de-duplicated. */
export function doubleClick(state: DrawState): Step {
  return finish(state);
}

export function keyDown(state: DrawState, key: string): Step {
  switch (key) {
    case 'Enter':
      return finish(state);
    case 'Escape':
      // First Escape cancels the drawing, a second one leaves the tool.
      if (isDrawing(state) || state.press) return { state: { ...state, points: [], press: null } };
      return { state: state.tool === 'SELECT' ? state : selectTool(state, 'SELECT') };
    case 'Backspace':
      return { state: { ...state, points: state.points.slice(0, -1) } };
    case 'Delete':
      return state.tool === 'SELECT' ? { state, effect: { type: 'deleteSelected' } } : { state };
    default:
      return { state };
  }
}

function addPoint(state: DrawState, p: Point, zoom: number): Step {
  const last = state.points.at(-1);
  if (last && distance(last, p) * zoom < DUPLICATE_PX) return { state };
  const first = state.points[0];
  if (isPolygonTool(state.tool) && state.points.length >= 3 && distance(first, p) * zoom <= CLOSE_PX) {
    return finish(state);
  }
  return { state: { ...state, points: [...state.points, p] } };
}

/** Commits the shape when it has enough points; otherwise leaves the drawing untouched. */
function finish(state: DrawState): Step {
  const points = state.points;
  const cleared: DrawState = { ...state, points: [], press: null };
  switch (state.tool) {
    case 'WALL':
      return points.length >= 2
        ? { state: cleared, effect: { type: 'commit', element: { type: 'WALL', points, thickness: PLAN_DEFAULTS.wallThickness } } }
        : { state };
    case 'OUTLINE':
      return points.length >= 3
        ? { state: cleared, effect: { type: 'commit', element: { type: 'OUTLINE', points, thickness: PLAN_DEFAULTS.outlineThickness } } }
        : { state };
    case 'ZONE':
      return points.length >= 3 ? { state: cleared, effect: { type: 'commit', element: { type: 'ZONE', points } } } : { state };
    case 'ROOM':
      return points.length >= 3 ? { state: cleared, effect: { type: 'requestRoomLabel', points } } : { state };
    default:
      return { state };
  }
}

function commitPlaced(
  type: 'DESK' | 'DECOR',
  position: Point,
  size: { width: number; height: number },
  kind?: DecorKind,
): DrawEffect {
  const placed = { position, width: size.width, height: size.height, rotation: 0 };
  return { type: 'commit', element: type === 'DESK' ? { type, ...placed } : { type, kind: kind!, ...placed } };
}
