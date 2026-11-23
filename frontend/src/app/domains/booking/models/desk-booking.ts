/** How long a desk booking lasts (E5.T3); mirrors the backend's `DeskBookingMode`. */
export type DeskBookingMode = 'FULL_DAY' | 'MORNING' | 'AFTERNOON' | 'CUSTOM';

export const DESK_BOOKING_MODES: readonly DeskBookingMode[] = [
  'FULL_DAY',
  'MORNING',
  'AFTERNOON',
  'CUSTOM',
];

/** What the server books with; read from `GET /api/v1/bookings/desk/settings`, never hard-coded. */
export interface DeskBookingSettings {
  /** `HH:mm:ss`: where the morning ends and the afternoon starts. */
  readonly halfDaySplit: string;
  /** How many days after today (in the building's time zone) can be booked. */
  readonly maxDaysAhead: number;
  /** The grid of custom start and end times. */
  readonly stepMinutes: number;
}

/** The date and times are wall-clock values in the building's time zone. */
export interface DeskBookingInput {
  readonly resourceId: string;
  /** `YYYY-MM-DD` */
  readonly date: string;
  readonly mode: DeskBookingMode;
  /** `HH:mm`, only for CUSTOM. */
  readonly startTime?: string;
  /** `HH:mm`, only for CUSTOM. */
  readonly endTime?: string;
}

export type BookingStatus = 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Booking {
  readonly id: string;
  readonly resourceId: string;
  readonly userId: string;
  readonly type: 'DESK' | 'MEETING_ROOM';
  readonly title: string | null;
  readonly description: string | null;
  /** UTC instant */
  readonly startsAt: string;
  /** UTC instant */
  readonly endsAt: string;
  readonly status: BookingStatus;
  readonly cancelReason: string | null;
  readonly attendeeIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The stored booking plus its times in the building's time zone (`HH:mm:ss`). */
export interface DeskBooking {
  readonly booking: Booking;
  readonly timeZone: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}
