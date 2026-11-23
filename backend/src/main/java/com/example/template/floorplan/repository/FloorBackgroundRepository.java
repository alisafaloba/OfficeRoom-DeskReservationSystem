package com.example.template.floorplan.repository;

import com.example.template.floorplan.dto.FloorBackgroundImage;
import com.example.template.floorplan.dto.FloorBackgroundResponse;
import com.example.template.floorplan.model.FloorBackground;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FloorBackgroundRepository extends JpaRepository<FloorBackground, UUID> {

    Optional<FloorBackground> findByFloorId(UUID floorId);

    /** The settings without the image bytes, which can be megabytes. */
    @Query("""
            select new com.example.template.floorplan.dto.FloorBackgroundResponse(
                b.contentType, b.sizeBytes, b.opacity, b.cmPerPixel, b.updatedAt)
            from FloorBackground b where b.floorId = :floorId""")
    Optional<FloorBackgroundResponse> findSettingsByFloorId(@Param("floorId") UUID floorId);

    @Query("""
            select new com.example.template.floorplan.dto.FloorBackgroundImage(b.content, b.contentType)
            from FloorBackground b where b.floorId = :floorId""")
    Optional<FloorBackgroundImage> findImageByFloorId(@Param("floorId") UUID floorId);
}
