/** A position in plan units (1 unit = 1 cm). Never scaled by the current zoom. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type DecorKind = 'DOOR' | 'WINDOW' | 'STAIRS' | 'ELEVATOR' | 'PLANT';

export const DECOR_KINDS: readonly DecorKind[] = ['DOOR', 'WINDOW', 'STAIRS', 'ELEVATOR', 'PLANT'];

/** Rotation is in degrees, clockwise. It is stored from the start so rotating needs no format change. */
interface Placed {
  readonly position: Point;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface WallElement {
  readonly id: string;
  readonly type: 'WALL';
  /** Open polyline. */
  readonly points: readonly Point[];
  readonly thickness: number;
}

export interface OutlineElement {
  readonly id: string;
  readonly type: 'OUTLINE';
  /** Closed polygon drawn as a thick line. */
  readonly points: readonly Point[];
  readonly thickness: number;
}

export interface ZoneElement {
  readonly id: string;
  readonly type: 'ZONE';
  readonly points: readonly Point[];
  readonly label?: string;
}

export interface RoomElement {
  readonly id: string;
  readonly type: 'ROOM';
  /** A dragged rectangle is stored as its four corners. */
  readonly points: readonly Point[];
  readonly label: string;
}

export interface DeskElement extends Placed {
  readonly id: string;
  readonly type: 'DESK';
}

export interface DecorElement extends Placed {
  readonly id: string;
  readonly type: 'DECOR';
  readonly kind: DecorKind;
}

/** Bookable: placed like a desk, booked through the desk booking flow. */
export interface PhoneBoothElement extends Placed {
  readonly id: string;
  readonly type: 'PHONE_BOOTH';
}

/** Bookable: placed like a desk, booked through the desk booking flow. */
export interface ParkingSpotElement extends Placed {
  readonly id: string;
  readonly type: 'PARKING_SPOT';
}

/** Non-bookable: shown on the plan only; the backend rejects any booking attempt with 400. */
export interface BreakRoomElement {
  readonly id: string;
  readonly type: 'BREAK_ROOM';
  /** A dragged rectangle is stored as its four corners. */
  readonly points: readonly Point[];
  readonly label: string;
}

export type PlanElement =
  | WallElement
  | OutlineElement
  | ZoneElement
  | RoomElement
  | DeskElement
  | DecorElement
  | PhoneBoothElement
  | ParkingSpotElement
  | BreakRoomElement;

export type PlanElementType = PlanElement['type'];

/** An element before it gets its id. */
export type NewElement = PlanElement extends infer E ? (E extends PlanElement ? Omit<E, 'id'> : never) : never;

/** Default sizes in plan units (cm). */
export const PLAN_DEFAULTS = {
  wallThickness: 20,
  outlineThickness: 30,
  desk: { width: 140, height: 70 },
  phoneBooth: { width: 120, height: 120 },
  parkingSpot: { width: 250, height: 500 },
  decor: {
    DOOR: { width: 90, height: 20 },
    WINDOW: { width: 120, height: 20 },
    STAIRS: { width: 120, height: 240 },
    ELEVATOR: { width: 200, height: 200 },
    PLANT: { width: 60, height: 60 },
  } satisfies Record<DecorKind, { width: number; height: number }>,
} as const;
