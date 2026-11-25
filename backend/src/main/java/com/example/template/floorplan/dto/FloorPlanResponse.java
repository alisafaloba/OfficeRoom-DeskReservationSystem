package com.example.template.floorplan.dto;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * A floor's plan. A floor that was never saved answers an empty plan with {@code version} null,
 * so the editor always has something to open.
 *
 * <p>A {@code resourceId} whose resource has been deleted since the save is left out, so the
 * shape shows as unbound instead of pointing at nothing.
 */
public record FloorPlanResponse(
        UUID floorId,
        @Nullable Long version,
        int schemaVersion,
        JsonNode elements,
        @Nullable Instant updatedAt,
        @Nullable UUID updatedBy) {}
