package com.example.template.building.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * The building's floors in their new display order, first to last. It must name every floor of
 * the building exactly once; anything else is rejected, so a stale page cannot drop a floor
 * from the order.
 */
public record FloorOrderRequest(@NotEmpty List<@NotNull UUID> floorIds) {}
