package com.example.template.resource.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Payload for adding an equipment item to the shared catalogue. */
public record EquipmentRequest(
        @NotBlank @Size(max = 255) String name) {}
