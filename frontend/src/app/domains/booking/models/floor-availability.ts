/** Mirrors the backend's `AvailabilityStatus` (E4.T1). */
export type AvailabilityStatus = 'FREE' | 'BOOKED' | 'BOOKED_BY_ME' | 'UNAVAILABLE';

export interface BookingSummary {
  /** UTC instant */
  readonly startsAt: string;
  /** UTC instant */
  readonly endsAt: string;
  readonly title: string | null;
  readonly bookedBy: string | null;
  readonly mine: boolean;
}

export interface ResourceAvailability {
  readonly resourceId: string;
  readonly name: string;
  readonly type: 'DESK' | 'MEETING_ROOM' | 'PHONE_BOOTH' | 'PARKING_SPOT' | 'BREAK_ROOM';
  readonly bookable: boolean;
  readonly status: AvailabilityStatus;
  /** Earliest first. */
  readonly bookings: readonly BookingSummary[];
}

export interface FloorAvailability {
  readonly floorId: string;
  readonly from: string;
  readonly to: string;
  /** In name order. */
  readonly resources: readonly ResourceAvailability[];
}
