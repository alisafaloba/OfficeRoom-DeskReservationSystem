package com.example.template.booking.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Read-only snapshot of a booking for its owner and for admins.
 *
 * @param title meeting-room title, {@code null} for desk bookings
 * @param cancelReason set only when {@code status} is CANCELLED
 * @param attendeeIds invited colleagues, sorted; empty for desk bookings
 */
public record BookingResponse(
        UUID id,
        UUID resourceId,
        UUID userId,
        BookingType type,
        @Nullable String title,
        @Nullable String description,
        Instant startsAt,
        Instant endsAt,
        BookingStatus status,
        @Nullable String cancelReason,
        List<UUID> attendeeIds,
        Instant createdAt,
        Instant updatedAt) {}
