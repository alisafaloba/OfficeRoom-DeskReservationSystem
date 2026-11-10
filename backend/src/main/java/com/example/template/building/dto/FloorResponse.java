package com.example.template.building.dto;

import java.time.Instant;
import java.util.UUID;

/** {@code sortOrder} is the 0-based display position; lists already arrive in that order. */
public record FloorResponse(UUID id, UUID buildingId, String name, int number, int sortOrder, Instant createdAt) {}
