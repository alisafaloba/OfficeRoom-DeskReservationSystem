package com.example.template.resource.dto;

import java.time.Instant;
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
        boolean bookable,
        Instant createdAt) {}
