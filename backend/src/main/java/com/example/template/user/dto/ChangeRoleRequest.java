package com.example.template.user.dto;

import com.example.template.shared.security.Role;
import jakarta.validation.constraints.NotNull;

/** Body of the admin role-change call: only the new role, nothing else is editable here. */
public record ChangeRoleRequest(@NotNull Role role) {}