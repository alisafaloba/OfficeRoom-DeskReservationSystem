package com.example.template.user.dto;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The user's booking-related preferences, nested inside {@link UserResponse}.
 * Grouped to keep the flat {@code users} table columns from cluttering the top-level response
 * and to give booking features a single object to pass around.
 */
public record UserPreferences(
        /** Preferred desk — null until the user has chosen one or until E2.T3 lands. */
        @Nullable UUID favoriteDeskId,
        @Nullable String defaultBuilding,
        @Nullable String defaultFloor) {}
