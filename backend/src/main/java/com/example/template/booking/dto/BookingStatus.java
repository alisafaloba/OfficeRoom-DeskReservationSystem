package com.example.template.booking.dto;

import java.util.Set;

/**
 * Lifecycle of a booking: CONFIRMED → CHECKED_IN → COMPLETED, or CONFIRMED → CANCELLED | NO_SHOW.
 * Only the order of the states is modelled here; when a change may happen is up to the callers.
 *
 * <p>Lives in {@code dto} rather than {@code model} because requests and responses carry it and
 * controllers may not see {@code model} (ArchitectureTest), the same as {@code ResourceType}.
 */
public enum BookingStatus {

    /** The state every booking starts in; the booker has not checked in yet. */
    CONFIRMED,

    /** The booker checked in on site. */
    CHECKED_IN,

    /** Checked in and over. */
    COMPLETED,

    /**
     * Cancelled by the booker or an admin. Meant to happen before the start, but that time rule is
     * the caller's job (see {@code BookingService}); the lifecycle only checks the previous state.
     */
    CANCELLED,

    /** Not checked in within the grace period; the resource was released. */
    NO_SHOW;

    /**
     * The statuses in which a booking holds its resource for its time range. Cancelled and
     * no-show bookings release it; completed ones still count, so past ranges show who was there.
     */
    public static final Set<BookingStatus> OCCUPYING = Set.of(CONFIRMED, CHECKED_IN, COMPLETED);

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
