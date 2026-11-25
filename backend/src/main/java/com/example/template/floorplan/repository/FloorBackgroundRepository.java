package com.example.template.floorplan.repository;

import com.example.template.floorplan.dto.FloorBackgroundImage;
import com.example.template.floorplan.dto.FloorBackgroundResponse;
import com.example.template.floorplan.dto.FloorBackgroundSettingsRequest;
import com.example.template.floorplan.model.FloorBackground;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FloorBackgroundRepository extends JpaRepository<FloorBackground, UUID> {

    Optional<FloorBackground> findByFloorId(UUID floorId);

    /** The settings without the image bytes, which can be megabytes. */
    @Query("""
            select new com.example.template.floorplan.dto.FloorBackgroundResponse(
                b.contentType, b.sizeBytes, b.opacity, b.cmPerPixel,
                b.offsetX, b.offsetY, b.rotation, b.visible, b.updatedAt)
            from FloorBackground b where b.floorId = :floorId""")
    Optional<FloorBackgroundResponse> findSettingsByFloorId(@Param("floorId") UUID floorId);

    @Query("""
            select new com.example.template.floorplan.dto.FloorBackgroundImage(b.content, b.contentType, b.version)
            from FloorBackground b where b.floorId = :floorId""")
    Optional<FloorBackgroundImage> findImageByFloorId(@Param("floorId") UUID floorId);

    /** The version alone, for answering a conditional image request without reading the bytes. */
    @Query("select b.version from FloorBackground b where b.floorId = :floorId")
    Optional<Long> findVersionByFloorId(@Param("floorId") UUID floorId);

    /**
     * Changes the display settings without loading the image bytes (up to 10 MB). A bulk update skips
     * the entity callbacks and {@code @Version}, so it sets {@code updatedAt} and bumps
     * {@code version} itself: an upload that loaded the row before this update then still fails
     * its optimistic-lock check instead of writing the old settings back. Returns the rows changed.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update FloorBackground b
            set b.opacity = :opacity, b.cmPerPixel = :cmPerPixel,
                b.offsetX = :offsetX, b.offsetY = :offsetY,
                b.rotation = :rotation, b.visible = :visible,
                b.updatedAt = :now, b.version = b.version + 1
            where b.floorId = :floorId""")
    int updateSettings(
            @Param("floorId") UUID floorId,
            @Param("opacity") int opacity,
            @Param("cmPerPixel") double cmPerPixel,
            @Param("offsetX") double offsetX,
            @Param("offsetY") double offsetY,
            @Param("rotation") int rotation,
            @Param("visible") boolean visible,
            @Param("now") Instant now);

    /** {@link #updateSettings(UUID, int, double, double, double, int, boolean, Instant)} from a request. */
    default int updateSettings(UUID floorId, FloorBackgroundSettingsRequest s, Instant now) {
        return updateSettings(
                floorId, s.opacity(), s.cmPerPixel(), s.offsetX(), s.offsetY(), s.rotation(), s.visible(), now);
    }

    /** Deletes the image without loading its bytes. Returns the rows deleted (0 or 1). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FloorBackground b where b.floorId = :floorId")
    int deleteByFloorId(@Param("floorId") UUID floorId);
}
