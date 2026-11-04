package com.example.template.user.dto;

import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** A user's booking preferences; every field is optional. */
public record UserPreferences(
        @Nullable UUID favoriteDeskId,
        @Size(max = 100) @Nullable String defaultBuilding,
        @Size(max = 100) @Nullable String defaultFloor) {}
