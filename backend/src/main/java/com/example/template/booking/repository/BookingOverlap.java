package com.example.template.booking.repository;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** An active booking that overlaps a requested range, with the booker's name already joined. */
public record BookingOverlap(
        UUID resourceId,
        UUID userId,
        @Nullable String title,
        Instant startsAt,
        Instant endsAt,
        @Nullable String firstName,
        @Nullable String lastName) {}
