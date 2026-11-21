package com.example.template.booking.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * What a booking flow (desk or meeting room) asks {@code BookingService.create} to store. The
 * flows add their own rules (opening hours, half days, booking limits) before calling it.
 *
 * @param attendeeIds invited colleagues for meeting rooms; {@code null} means none
 */
public record CreateBookingRequest(
        @NotNull UUID resourceId,
        @NotNull BookingType type,
        @NotNull Instant startsAt,
        @NotNull Instant endsAt,
        @Nullable @Size(max = 200) String title,
        @Nullable @Size(max = 2000) String description,
        @Nullable @Size(max = 100) List<UUID> attendeeIds) {}
