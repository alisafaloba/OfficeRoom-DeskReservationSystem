package com.example.template.booking.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

/**
 * Moves a booking to a new time and/or resource ("My bookings" edit, admin edit). Pass the
 * current resource id to change only the time.
 */
public record MoveBookingRequest(@NotNull UUID resourceId, @NotNull Instant startsAt, @NotNull Instant endsAt) {}
