package com.example.template.user.dto;

import com.example.template.shared.security.Role;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Public view of a user account. Sensitive fields (password hash, TOTP secret, lock state) are
 * never included. The {@link UserPreferences} nest groups the booking-preference fields.
 */
public record UserResponse(
        UUID id,
        String email,
        Role role,
        boolean twoFactorEnabled,
        Instant createdAt,
        @Nullable String firstName,
        @Nullable String lastName,
        @Nullable String department,
        boolean active,
        UserPreferences preferences) {}
