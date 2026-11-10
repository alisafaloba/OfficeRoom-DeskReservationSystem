package com.example.template.resource.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Payload for creating or updating a resource. */
public record ResourceRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull ResourceType type) {}
