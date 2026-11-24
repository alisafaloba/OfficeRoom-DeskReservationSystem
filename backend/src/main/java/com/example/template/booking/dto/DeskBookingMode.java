package com.example.template.booking.dto;

/**
 * How long a desk booking lasts (E5.T3). Full and half days come from the building's opening
 * hours for that day; only CUSTOM carries its own start and end time.
 */
public enum DeskBookingMode {

    /** From the building's opening time to its closing time. */
    FULL_DAY,

    /** From the opening time to the half-day split (default 13:00). */
    MORNING,

    /** From the half-day split (default 13:00) to the closing time. */
    AFTERNOON,

    /** The start and end time the user picked, in 15-minute steps. */
    CUSTOM
}
