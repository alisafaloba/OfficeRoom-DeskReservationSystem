package com.example.template.booking.dto;

/**
 * The booking flow a booking came from. Desks, phone booths and parking spots use {@link #DESK};
 * only {@link #MEETING_ROOM} bookings carry a title, a description and attendees.
 *
 * <p>Lives in {@code dto} rather than {@code model} because requests and responses carry it and
 * controllers may not see {@code model} (ArchitectureTest), the same as {@code ResourceType}.
 */
public enum BookingType {
    DESK,
    MEETING_ROOM
}
