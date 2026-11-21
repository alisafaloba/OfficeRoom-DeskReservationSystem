package com.example.template.booking.model;

/** Lifecycle of a booking. Only {@link #ACTIVE} bookings occupy their resource. */
public enum BookingStatus {
    ACTIVE,
    CANCELLED
}
