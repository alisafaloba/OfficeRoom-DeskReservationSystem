package com.example.template.floorplan.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * A plan to store.
 *
 * @param version the version the editor loaded; {@code null} when the floor had no plan yet.
 *     A value that is no longer current is rejected with 409 {@code FLOOR_PLAN_OUTDATED}.
 * @param schemaVersion the version of the element format (E0.T4); only 1 exists today.
 * @param elements the JSON array of plan elements. Every element has an {@code id} and a
 *     {@code type}; desk, room, phone booth, parking spot and break room shapes may carry a
 *     {@code resourceId}. The rest of each element (geometry) is stored as sent.
 */
public record FloorPlanRequest(
        @Nullable Long version,
        @NotNull @Min(1) @Max(1) Integer schemaVersion,
        @NotNull JsonNode elements) {}
