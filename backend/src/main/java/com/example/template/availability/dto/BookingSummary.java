package com.example.template.availability.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * The short form of a booking shown in the floor plan tooltip. Only the booker's name is
 * shared, never their e-mail or anything else from their profile.
 *
 * @param title meeting-room title, {@code null} for desk bookings
 * @param bookedBy the booker's first and last name, {@code null} if they have not set one
 * @param mine whether the caller holds this booking
 */
public record BookingSummary(
        Instant startsAt, Instant endsAt, @Nullable String title, @Nullable String bookedBy, boolean mine) {}
