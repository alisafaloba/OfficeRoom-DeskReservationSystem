package com.example.template.floorplan.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The architectural plan image shown under a floor's drawing, with how it is displayed.
 *
 * <p>The bytes live in the row: deleting the row deletes the file, and the floor's ON DELETE
 * CASCADE takes it along. The floor is a plain id, as everywhere across feature boundaries.
 */
@Entity
@Table(name = "floor_backgrounds")
@Getter
@Setter
@NoArgsConstructor
public class FloorBackground extends BaseEntity {

    @Column(name = "floor_id", nullable = false, updatable = false, unique = true)
    private UUID floorId;

    @Column(nullable = false)
    private byte[] content;

    /** {@code image/png} or {@code image/jpeg}, detected from the content. */
    @Column(name = "content_type", nullable = false, length = 20)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private int sizeBytes;

    /** 0 (invisible) to 100 (fully opaque). */
    @Column(nullable = false)
    private int opacity;

    /** Plan centimetres covered by one image pixel. */
    @Column(name = "cm_per_pixel", nullable = false)
    private double cmPerPixel;

    /** Plan position (cm) of the top-left corner of the image as drawn, after rotation. */
    @Column(name = "offset_x", nullable = false)
    private double offsetX;

    @Column(name = "offset_y", nullable = false)
    private double offsetY;

    /** Clockwise quarter turns, in degrees: 0, 90, 180 or 270. */
    @Column(nullable = false)
    private int rotation;

    /** A hidden image stays stored; the editor just does not draw it. */
    @Column(nullable = false)
    private boolean visible = true;

    public FloorBackground(UUID floorId) {
        this.floorId = floorId;
    }
}
