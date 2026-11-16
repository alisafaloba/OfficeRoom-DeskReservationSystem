/** One level of a building. Lists arrive in display order; `sortOrder` is the 0-based position. */
export interface Floor {
  readonly id: string;
  readonly buildingId: string;
  readonly name: string;
  /** The level as people say it: -1 for a basement, 0 for the ground floor. Unique per building. */
  readonly number: number;
  readonly sortOrder: number;
  readonly createdAt: string;
}

/** Create and update share one shape; the position only changes through a reorder. */
export interface FloorInput {
  readonly name: string;
  readonly number: number;
}

/** The range the backend accepts for a floor number. */
export const MIN_FLOOR_NUMBER = -50;
export const MAX_FLOOR_NUMBER = 500;
