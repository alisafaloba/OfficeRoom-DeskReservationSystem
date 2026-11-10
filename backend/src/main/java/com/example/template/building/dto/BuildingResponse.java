package com.example.template.building.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** {@code floorCount} is the number of floors the building has; the buildings list shows it. */
public record BuildingResponse(
        UUID id,
        String name,
        String address,
        String timeZone,
        List<OpeningHoursDto> openingHours,
        int floorCount,
        Instant createdAt) {}
