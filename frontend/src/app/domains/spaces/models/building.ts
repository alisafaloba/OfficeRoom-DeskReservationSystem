export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export const WEEKDAYS: readonly Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/** Both times `null` means the building is closed that day. The API sends times as `HH:mm:ss`. */
export interface OpeningHours {
  readonly dayOfWeek: Weekday;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export interface Building {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly timeZone: string;
  readonly openingHours: readonly OpeningHours[];
  readonly floorCount: number;
  readonly createdAt: string;
}

/** Create and update share one shape: an update replaces every field. */
export interface BuildingInput {
  readonly name: string;
  readonly address: string;
  readonly timeZone: string;
  readonly openingHours: readonly OpeningHours[];
}
