package com.example.template.floorplan.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Opacity in percent, and the scale as plan centimetres per image pixel. */
public record FloorBackgroundSettingsRequest(
        @NotNull @Min(0) @Max(100) Integer opacity,
        @NotNull @DecimalMin("0.01") @DecimalMax("100") Double cmPerPixel) {}
