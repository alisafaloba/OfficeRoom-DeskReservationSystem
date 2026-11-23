package com.example.template.floorplan.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * The drawing of one floor: the editor's element list as JSON (E3.T5). Bound shapes carry a
 * {@code resourceId} inside that JSON (E3.T4).
 *
 * <p>The floor is a plain id, not a {@code @ManyToOne}: the database removes the plan with its
 * floor (ON DELETE CASCADE). {@code BaseEntity.version} is the version clients send back, so a
 * stale save is rejected instead of overwriting someone else's work.
 */
@Entity
@Table(name = "floor_plans")
@Getter
@Setter
@NoArgsConstructor
public class FloorPlan extends BaseEntity {

    @Column(name = "floor_id", nullable = false, updatable = false)
    private UUID floorId;

    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;

    /** The JSON array of plan elements, exactly as the editor sent it. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String content;

    @Column(name = "updated_by")
    private @Nullable UUID updatedBy;

    public FloorPlan(UUID floorId) {
        this.floorId = floorId;
    }
}
