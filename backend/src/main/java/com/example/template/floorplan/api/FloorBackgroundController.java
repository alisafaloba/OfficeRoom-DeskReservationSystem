package com.example.template.floorplan.api;

import com.example.template.floorplan.dto.FloorBackgroundResponse;
import com.example.template.floorplan.dto.FloorBackgroundSettingsRequest;
import com.example.template.floorplan.service.FloorBackgroundService;
import com.example.template.shared.security.AdminOnly;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The architectural plan image drawn under a floor plan. Every signed-in user may read it;
 * only admins upload, adjust or remove it.
 */
@RestController
@RequestMapping("/api/v{version}/floors/{floorId}/background")
public class FloorBackgroundController {

    private final FloorBackgroundService backgroundService;

    public FloorBackgroundController(FloorBackgroundService backgroundService) {
        this.backgroundService = backgroundService;
    }

    /** Opacity, scale and file facts; 404 FLOOR_BACKGROUND_NOT_FOUND when the floor has no image. */
    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public FloorBackgroundResponse get(@PathVariable UUID floorId) {
        return backgroundService.get(floorId);
    }

    /** The image bytes with their detected type; nosniff so a browser never reinterprets them. */
    @GetMapping(path = "/image", version = "1")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> image(@PathVariable UUID floorId) {
        var image = backgroundService.image(floorId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .cacheControl(CacheControl.noCache().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(image.content());
    }

    /** Multipart field {@code file}: a PNG or JPEG of at most 10 MB. Replaces any earlier image. */
    @PutMapping(version = "1")
    @AdminOnly
    public FloorBackgroundResponse upload(@PathVariable UUID floorId, @RequestPart("file") MultipartFile file)
            throws IOException {
        return backgroundService.upload(floorId, file.getBytes());
    }

    @PatchMapping(version = "1")
    @AdminOnly
    public FloorBackgroundResponse updateSettings(
            @PathVariable UUID floorId, @Valid @RequestBody FloorBackgroundSettingsRequest request) {
        return backgroundService.updateSettings(floorId, request);
    }

    @DeleteMapping(version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID floorId) {
        backgroundService.delete(floorId);
    }
}
