package com.example.template.building.dto;

import com.example.template.building.model.Resource.ResourceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Set;
import java.util.UUID;

public record ResourceRequest(
        @NotNull ResourceType type,
        @NotBlank String label,
        Integer capacity,
        String notes,
        Set<UUID> equipmentIds
) {}