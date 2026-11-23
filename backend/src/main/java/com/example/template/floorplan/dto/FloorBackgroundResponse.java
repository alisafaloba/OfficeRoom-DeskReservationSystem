package com.example.template.floorplan.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * How a floor's background image is shown. The image itself is a separate download, so this
 * stays small. {@code updatedAt} changes with every upload and lets clients bust caches.
 */
public record FloorBackgroundResponse(
        String contentType, int sizeBytes, int opacity, double cmPerPixel, @Nullable Instant updatedAt) {}
