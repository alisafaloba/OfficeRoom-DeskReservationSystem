package com.example.template.user.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Full replacement of the fields a user may edit on their own profile. An absent
 * {@code preferences} block keeps the stored preferences.
 */
public record UpdateOwnProfileRequest(
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        @Size(max = 100) @Nullable String department,
        @Valid @Nullable UserPreferences preferences) {}
