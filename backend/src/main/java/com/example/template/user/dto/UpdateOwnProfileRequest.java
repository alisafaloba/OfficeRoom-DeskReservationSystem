package com.example.template.user.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/users/me}.
 *
 * <p>Only personal data and preferences may be changed through this endpoint — e-mail and role
 * are immutable from the caller's own perspective and are ignored even if sent. Desk-existence
 * validation inside {@code preferences} is deferred until E2.T3 lands the desk table.
 */
public record UpdateOwnProfileRequest(
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        @Size(max = 100) @Nullable String department,
        @Valid @Nullable UserPreferences preferences) {}
