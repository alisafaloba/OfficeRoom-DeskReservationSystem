package com.example.template.building.dto;

import com.example.template.building.model.Resource.ResourceType;
import java.util.Set;
import java.util.UUID;

public record ResourceResponse(
        UUID id,
        UUID floorId,
        ResourceType type,
        String label,
        Integer capacity,
        String notes,
        String status,
        Set<EquipmentResponse> equipment
) {}