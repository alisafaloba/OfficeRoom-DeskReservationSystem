package com.example.template.resource.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Read-only snapshot of a resource.
 *
 * <p>{@code bookable} mirrors {@link ResourceType#isBookable()} and lets clients hide or disable
 * the booking button without hard-coding the type list.
 */
public record ResourceResponse(
        UUID id,
        UUID floorId,
        String name,
        ResourceType type,
        int capacity,
        String notes,
        ResourceStatus status,
        String statusReason,
        boolean bookable,
        List<EquipmentResponse> equipment,
        Instant createdAt) {}