import { ResourceType } from '@app/spaces/models/resource';

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

/**
 * Shapes that stand for a resource in the database (E3.T4) carry its id. Unbound shapes have none;
 * the label shown on the plan is the resource's current name, so a renamed resource shows up renamed.
 */
interface Bound {
  readonly resourceId?: string;
}

export interface RoomElement extends Bound {
  readonly id: string;
  readonly type: 'ROOM';
  /** A dragged rectangle is stored as its four corners. */
  readonly points: readonly Point[];
  /** Typed when drawing; shown only while the room is not bound to a meeting room. */
  readonly label: string;
}

export interface DeskElement extends Placed, Bound {
  readonly id: string;
  readonly type: 'DESK';
}

export interface DecorElement extends Placed {
  readonly id: string;
  readonly type: 'DECOR';
  readonly kind: DecorKind;
}

/** Bookable: placed like a desk, booked through the desk booking flow. */
export interface PhoneBoothElement extends Placed, Bound {
  readonly id: string;
  readonly type: 'PHONE_BOOTH';
}

/** Bookable: placed like a desk, booked through the desk booking flow. */
export interface ParkingSpotElement extends Placed, Bound {
  readonly id: string;
  readonly type: 'PARKING_SPOT';
}

/** Non-bookable: shown on the plan only; the backend rejects any booking attempt with 400. */
export interface BreakRoomElement extends Bound {
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

/** Shapes that can be bound to a resource. */
export type BindableElement = DeskElement | RoomElement | PhoneBoothElement | ParkingSpotElement | BreakRoomElement;

export type BindableType = BindableElement['type'];

/** The resource type each bindable shape takes; the backend applies the same table on save. */
export const RESOURCE_TYPE_FOR: Readonly<Record<BindableType, ResourceType>> = {
  DESK: 'DESK',
  ROOM: 'MEETING_ROOM',
  PHONE_BOOTH: 'PHONE_BOOTH',
  PARKING_SPOT: 'PARKING_SPOT',
  BREAK_ROOM: 'BREAK_ROOM',
};

export const isBindable = (element: PlanElement): element is BindableElement => element.type in RESOURCE_TYPE_FOR;

/** Version of the element format above, stored with every plan. */
export const PLAN_SCHEMA_VERSION = 1;

/** A floor's plan as GET/PUT /api/v1/floors/{id}/plan exchange it. */
export interface FloorPlanDocument {
  readonly floorId: string;
  /** Null for a floor that has never been saved. */
  readonly version: number | null;
  readonly schemaVersion: number;
  readonly elements: readonly PlanElement[];
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

/** An element before it gets its id. */
export type NewElement = PlanElement extends infer E ? (E extends PlanElement ? Omit<E, 'id'> : never) : never;

/** Default sizes in plan units (cm). */
export const PLAN_DEFAULTS = {
  wallThickness: 20,
  outlineThickness: 30,
  desk: { width: 140, height: 70 },
  phoneBooth: { width: 120, height: 120 },
  parkingSpot: { width: 250, height: 500 },
  /** A meeting room or break room dropped from the unplaced list, before the admin resizes it. */
  room: { width: 400, height: 300 },
  decor: {
    DOOR: { width: 90, height: 20 },
    WINDOW: { width: 120, height: 20 },
    STAIRS: { width: 120, height: 240 },
    ELEVATOR: { width: 200, height: 200 },
    PLANT: { width: 60, height: 60 },
  } satisfies Record<DecorKind, { width: number; height: number }>,
} as const;
