package com.example.template.user.dto;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The user's booking-related preferences, nested inside {@link UserResponse}.
 * Grouped to keep the flat {@code users} table columns from cluttering the top-level response
 * and to give booking features a single object to pass around.
 *
 * <p>All three are ids of catalog entries, never names, and are validated against the catalog and
 * against each other when the profile is saved: the floor must belong to the building, and the
 * desk to the floor.
 */
public record UserPreferences(
        /** Preferred desk — null until the user has chosen one. Must be an existing DESK resource on the default floor. */
        @Nullable UUID favoriteDeskId,
        /** Preferred building — null until chosen. Must be an existing building. */
        @Nullable UUID defaultBuildingId,
        /** Preferred floor — null until chosen. Must be a floor of {@link #defaultBuildingId()}. */
        @Nullable UUID defaultFloorId) {}
