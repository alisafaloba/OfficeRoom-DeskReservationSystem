package com.example.template.booking.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A desk booking as the user picks it (E5.T3). The date and times are wall-clock values in the
 * building's time zone, whatever the browser's zone is; the server turns them into instants.
 *
 * @param startTime only for CUSTOM, in 15-minute steps
 * @param endTime only for CUSTOM, in 15-minute steps
 */
public record DeskBookingRequest(
        @NotNull UUID resourceId,
        @NotNull LocalDate date,
        @NotNull DeskBookingMode mode,
        @Nullable LocalTime startTime,
        @Nullable LocalTime endTime) {}
