package com.example.template.floorplan.service;

import java.util.Optional;

/**
 * The image formats a background may have, recognised by their signature bytes. The file name,
 * extension and the content type the browser sent are never trusted: a renamed file is still
 * what its bytes say it is.
 */
enum ImageFormat {
    PNG("image/png", new int[] {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}),
    JPEG("image/jpeg", new int[] {0xFF, 0xD8, 0xFF});

    private final String mediaType;
    private final int[] signature;

    ImageFormat(String mediaType, int[] signature) {
        this.mediaType = mediaType;
        this.signature = signature;
    }

    String mediaType() {
        return mediaType;
    }

    static Optional<ImageFormat> detect(byte[] content) {
        for (ImageFormat format : values()) {
            if (format.matches(content)) {
                return Optional.of(format);
            }
        }
        return Optional.empty();
    }

    private boolean matches(byte[] content) {
        if (content.length <= signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if ((content[i] & 0xFF) != signature[i]) {
                return false;
            }
        }
        return true;
    }
}
