package com.example.template.booking.model;

import java.util.Set;

/** Lifecycle of a booking: CONFIRMED → CHECKED_IN → COMPLETED, or CONFIRMED → CANCELLED | NO_SHOW. */
public enum BookingStatus {

    /** Booked and not started yet; the state every booking starts in. */
    CONFIRMED,

    /** The booker checked in on site. */
    CHECKED_IN,

    /** Checked in and over. */
    COMPLETED,

    /** Cancelled by the booker or an admin before it started. */
    CANCELLED,

    /** Not checked in within the grace period; the resource was released. */
    NO_SHOW;

    /**
     * The statuses in which a booking holds its resource for its time range. Cancelled and
     * no-show bookings release it; completed ones still count, so past ranges show who was there.
     */
    public static final Set<BookingStatus> OCCUPYING = Set.of(CONFIRMED, CHECKED_IN, COMPLETED);
}
