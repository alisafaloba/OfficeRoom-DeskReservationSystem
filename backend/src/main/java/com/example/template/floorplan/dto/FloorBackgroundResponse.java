package com.example.template.floorplan.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * How a floor's background image is shown. The image itself is a separate download, so this
 * stays small.
 *
 * @param offsetX plan position (cm) of the top-left corner of the image as drawn, after rotation
 * @param rotation clockwise, in degrees: 0, 90, 180 or 270
 * @param visible false while the admin has hidden it; it stays stored
 */
public record FloorBackgroundResponse(
        String contentType,
        int sizeBytes,
        int opacity,
        double cmPerPixel,
        double offsetX,
        double offsetY,
        int rotation,
        boolean visible,
        @Nullable Instant updatedAt) {}
