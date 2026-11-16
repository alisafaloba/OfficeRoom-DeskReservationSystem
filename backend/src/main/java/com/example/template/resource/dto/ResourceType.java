package com.example.template.resource.dto;

/**
 * The kinds of bookable or display-only resources on a floor plan.
 *
 * <p>Bookable types (DESK, PHONE_BOOTH, PARKING_SPOT) follow the desk booking flow (E5.T3).
 * Non-bookable types (BREAK_ROOM) are drawn on the floor plan but cannot be booked.
 */
public enum ResourceType {

    /** A standard workstation. Bookable. */
    DESK(true),

    /** A small enclosed booth for phone/video calls. Bookable. */
    PHONE_BOOTH(true),

    /** A vehicle parking space. Bookable. */
    PARKING_SPOT(true),

    /** A shared lounge or kitchen area. Shown on the map only; not bookable. */
    BREAK_ROOM(false);

    private final boolean bookable;

    ResourceType(boolean bookable) {
        this.bookable = bookable;
    }

    /** Whether this resource type can be reserved through the booking flow. */
    public boolean isBookable() {
        return bookable;
    }
}
