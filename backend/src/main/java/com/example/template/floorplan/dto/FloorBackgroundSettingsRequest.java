package com.example.template.floorplan.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Every display setting of a background image at once; the editor always sends all of them.
 *
 * @param opacity in percent
 * @param cmPerPixel plan centimetres covered by one image pixel
 * @param offsetX plan position (cm) of the top-left corner of the image as drawn; within 1 km
 * @param rotation clockwise quarter turns, in degrees: 0, 90, 180 or 270
 */
public record FloorBackgroundSettingsRequest(
        @NotNull @Min(0) @Max(100) Integer opacity,
        @NotNull @DecimalMin("0.01") @DecimalMax("100") Double cmPerPixel,
        @NotNull @DecimalMin("-100000") @DecimalMax("100000") Double offsetX,
        @NotNull @DecimalMin("-100000") @DecimalMax("100000") Double offsetY,
        @NotNull Integer rotation,
        @NotNull Boolean visible) {

    /** Validated as the field {@code quarterTurn}: the rotation is one of 0, 90, 180, 270. */
    @AssertTrue(message = "must be 0, 90, 180 or 270")
    public boolean isQuarterTurn() {
        return rotation == null || (rotation >= 0 && rotation < 360 && rotation % 90 == 0);
    }
}
