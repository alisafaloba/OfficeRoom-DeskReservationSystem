package com.example.template.building.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Create and update share one shape: an update replaces every field. */
public record BuildingRequest(
        @NotBlank @Size(max = 120) String name,
        @NotBlank @Size(max = 300) String address,
        @NotBlank @ValidTimeZone String timeZone,
        @NotNull @ValidWeek List<@NotNull @Valid OpeningHoursDto> openingHours) {}
