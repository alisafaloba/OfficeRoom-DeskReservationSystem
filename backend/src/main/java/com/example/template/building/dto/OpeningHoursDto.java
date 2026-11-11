package com.example.template.building.dto;

import jakarta.validation.constraints.NotNull;
import java.time.DayOfWeek;
import java.time.LocalTime;
import org.jspecify.annotations.Nullable;

/** One weekday, used in requests and responses; both times null means closed. */
@ValidDayHours
public record OpeningHoursDto(
        @NotNull DayOfWeek dayOfWeek, @Nullable LocalTime opensAt, @Nullable LocalTime closesAt) {}
