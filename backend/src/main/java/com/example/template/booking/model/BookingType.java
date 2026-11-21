package com.example.template.booking.model;

/**
 * The booking flow a booking came from. Desks, phone booths and parking spots use {@link #DESK};
 * only {@link #MEETING_ROOM} bookings carry a title, a description and attendees.
 */
public enum BookingType {
    DESK,
    MEETING_ROOM
}
