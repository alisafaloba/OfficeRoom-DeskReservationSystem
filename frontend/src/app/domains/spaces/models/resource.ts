export type ResourceType = 'DESK' | 'PHONE_BOOTH' | 'PARKING_SPOT' | 'BREAK_ROOM';

/** Something on a floor that can be placed on the plan; `bookable` follows from the type. */
export interface Resource {
  readonly id: string;
  readonly floorId: string;
  readonly name: string;
  readonly type: ResourceType;
  readonly bookable: boolean;
  readonly createdAt: string;
}
