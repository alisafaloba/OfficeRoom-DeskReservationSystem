package com.example.template.building.dto;

import java.util.UUID;

public record EquipmentResponse(
        UUID id,
        String name
) {}