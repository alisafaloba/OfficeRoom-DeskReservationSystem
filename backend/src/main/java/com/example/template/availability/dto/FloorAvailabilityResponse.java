package com.example.template.availability.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Every resource of a floor with its status for {@code [from, to)}, ordered by name. */
public record FloorAvailabilityResponse(
        UUID floorId, Instant from, Instant to, List<ResourceAvailability> resources) {}
