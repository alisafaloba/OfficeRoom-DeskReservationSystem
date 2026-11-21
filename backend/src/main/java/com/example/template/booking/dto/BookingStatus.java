package com.example.template.booking.dto;

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
     * The statuses in which a booking holds its resource for its time range: it blocks new
     * bookings (the {@code ex_bookings_no_overlap} constraint, E5.T2) and shows as booked on the
     * floor plan. Completed, cancelled and no-show bookings release the resource, so a booking
     * completed early frees the rest of its slot.
     */
    public static final Set<BookingStatus> OCCUPYING = Set.of(CONFIRMED, CHECKED_IN);

    /** The statuses this one may change to; empty for the final states. */
    public Set<BookingStatus> allowedNext() {
        return switch (this) {
            case CONFIRMED -> Set.of(CHECKED_IN, CANCELLED, NO_SHOW);
            case CHECKED_IN -> Set.of(COMPLETED);
            case COMPLETED, CANCELLED, NO_SHOW -> Set.of();
        };
    }

    public boolean canTransitionTo(BookingStatus next) {
        return allowedNext().contains(next);
    }

    /** COMPLETED, CANCELLED and NO_SHOW never change again. */
    public boolean isFinal() {
        return allowedNext().isEmpty();
    }
}
