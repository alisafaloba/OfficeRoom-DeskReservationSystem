package com.example.template.resource.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for changing a resource's status.
 */
public record ResourceStatusRequest(
        @NotNull ResourceStatus status,
        @Size(max = 500) String reason) {}
