package com.example.template.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * The editable account fields: e-mail and an optional new password (an absent password keeps the
 * current one). The role changes only through {@code PUT /users/{id}/role}.
 */
public record UpdateUserRequest(
        @NotBlank @Email @Size(max = 320) String email,
        @Size(min = 12, max = 128) @Nullable String password) {}
