package com.example.template.building.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** {@code floorCount} is what the list shows; it is 0 until floors exist (Task 2.2). */
public record BuildingResponse(
        UUID id,
        String name,
        String address,
        String timeZone,
        List<OpeningHoursDto> openingHours,
        int floorCount,
        Instant createdAt) {}
