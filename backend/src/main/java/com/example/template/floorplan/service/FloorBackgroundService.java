package com.example.template.floorplan.service;

import com.example.template.building.repository.FloorRepository;
import com.example.template.floorplan.dto.FloorBackgroundImage;
import com.example.template.floorplan.dto.FloorBackgroundResponse;
import com.example.template.floorplan.dto.FloorBackgroundSettingsRequest;
import com.example.template.floorplan.model.FloorBackground;
import com.example.template.floorplan.repository.FloorBackgroundRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The background image of a floor plan (E3.T6): one PNG or JPEG per floor, at most 10 MB,
 * recognised by its content. Reads are open to every signed-in user; writes are guarded in the
 * controller. An unknown floor is 404 FLOOR_NOT_FOUND, a floor without an image 404
 * FLOOR_BACKGROUND_NOT_FOUND, so clients can tell the two apart.
 */
@Service
public class FloorBackgroundService {

    /** Same limit as {@code spring.servlet.multipart.max-file-size}; checked here as well. */
    public static final int MAX_SIZE_BYTES = 10 * 1024 * 1024;

    static final int DEFAULT_OPACITY = 50;
    static final double DEFAULT_CM_PER_PIXEL = 1.0;

    /** One image per floor: two first uploads for the same floor race on this constraint. */
    static final String ONE_PER_FLOOR_CONSTRAINT = "uq_floor_backgrounds_floor";

    private static final Logger log = LoggerFactory.getLogger(FloorBackgroundService.class);

    private final FloorBackgroundRepository backgroundRepository;
    private final FloorRepository floorRepository;

    public FloorBackgroundService(FloorBackgroundRepository backgroundRepository, FloorRepository floorRepository) {
        this.backgroundRepository = backgroundRepository;
        this.floorRepository = floorRepository;
    }

    @Transactional(readOnly = true)
    public FloorBackgroundResponse get(UUID floorId) {
        requireFloor(floorId);
        return backgroundRepository
                .findSettingsByFloorId(floorId)
                .orElseThrow(() -> new ApiException(ErrorCode.FLOOR_BACKGROUND_NOT_FOUND));
    }

    /**
     * The current version of the floor's image, read without the bytes, so a conditional download
     * can be answered 304 cheaply. Empty when the floor has no image.
     */
    @Transactional(readOnly = true)
    public Optional<Long> imageVersion(UUID floorId) {
        requireFloor(floorId);
        return backgroundRepository.findVersionByFloorId(floorId);
    }

    @Transactional(readOnly = true)
    public FloorBackgroundImage image(UUID floorId) {
        requireFloor(floorId);
        return backgroundRepository
                .findImageByFloorId(floorId)
                .orElseThrow(() -> new ApiException(ErrorCode.FLOOR_BACKGROUND_NOT_FOUND));
    }

    /**
     * Stores the image, replacing any previous one; the old bytes are overwritten in the same
     * row, so nothing is left behind. Opacity and scale are kept on a replace.
     */
    @Transactional
    public FloorBackgroundResponse upload(UUID floorId, byte[] content) {
        requireFloor(floorId);
        if (content.length > MAX_SIZE_BYTES) {
            throw new ApiException(ErrorCode.IMAGE_TOO_LARGE);
        }
        var format = ImageFormat.detect(content).orElseThrow(() -> new ApiException(ErrorCode.UNSUPPORTED_IMAGE_TYPE));
        var background = backgroundRepository.findByFloorId(floorId).orElseGet(() -> fresh(floorId));
        background.setContent(content);
        background.setContentType(format.mediaType());
        background.setSizeBytes(content.length);
        var saved = save(background);
        log.info("Background image ({}, {} bytes) stored for floor {}", format.mediaType(), content.length, floorId);
        return toResponse(saved);
    }

    /** Changes the display settings (opacity, scale, position, rotation, visibility) without reading the bytes. */
    @Transactional
    public FloorBackgroundResponse updateSettings(UUID floorId, FloorBackgroundSettingsRequest request) {
        requireFloor(floorId);
        int changed = backgroundRepository.updateSettings(floorId, request, Instant.now());
        if (changed == 0) {
            throw new ApiException(ErrorCode.FLOOR_BACKGROUND_NOT_FOUND);
        }
        return backgroundRepository
                .findSettingsByFloorId(floorId)
                .orElseThrow(() -> new ApiException(ErrorCode.FLOOR_BACKGROUND_NOT_FOUND));
    }

    /** Removes the image and with it the stored file, without reading the bytes first. */
    @Transactional
    public void delete(UUID floorId) {
        requireFloor(floorId);
        if (backgroundRepository.deleteByFloorId(floorId) == 0) {
            throw new ApiException(ErrorCode.FLOOR_BACKGROUND_NOT_FOUND);
        }
        log.info("Background image removed from floor {}", floorId);
    }

    private static FloorBackground fresh(UUID floorId) {
        var background = new FloorBackground(floorId);
        background.setOpacity(DEFAULT_OPACITY);
        background.setCmPerPixel(DEFAULT_CM_PER_PIXEL);
        return background;
    }

    /**
     * Two first uploads racing for the same floor trip {@value #ONE_PER_FLOOR_CONSTRAINT}: the
     * loser reloads. The floor deleted between the check and the insert trips the foreign key
     * instead, and is answered like any missing floor. Anything else is a bug and stays a 500.
     */
    private FloorBackground save(FloorBackground background) {
        try {
            return backgroundRepository.saveAndFlush(background);
        } catch (DataIntegrityViolationException e) {
            String constraint = violatedConstraint(e);
            if (constraint.contains(ONE_PER_FLOOR_CONSTRAINT)) {
                throw new ApiException(ErrorCode.CONCURRENT_MODIFICATION);
            }
            if (constraint.contains("fk_floor_backgrounds_floor")) {
                throw new ApiException(ErrorCode.FLOOR_NOT_FOUND);
            }
            throw e;
        }
    }

    private static String violatedConstraint(DataIntegrityViolationException e) {
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(e);
        return cause instanceof SQLException sql ? Objects.toString(sql.getMessage(), "") : "";
    }

    private void requireFloor(UUID floorId) {
        if (!floorRepository.existsById(floorId)) {
            throw new ApiException(ErrorCode.FLOOR_NOT_FOUND);
        }
    }

    private static FloorBackgroundResponse toResponse(FloorBackground background) {
        return new FloorBackgroundResponse(
                background.getContentType(),
                background.getSizeBytes(),
                background.getOpacity(),
                background.getCmPerPixel(),
                background.getOffsetX(),
                background.getOffsetY(),
                background.getRotation(),
                background.isVisible(),
                background.getUpdatedAt());
    }
}
