package com.example.template.building.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One level of a building. It holds the resources (E2.T3) and the floor plan (E3).
 *
 * <p>The building is a plain id, not a {@code @ManyToOne}: the database removes floors with their
 * building (ON DELETE CASCADE), and a JPA relation with its own cascade would fight that.
 */
@Entity
@Table(name = "floors")
@Getter
@Setter
@NoArgsConstructor
public class Floor extends BaseEntity {

    @Column(name = "building_id", nullable = false, updatable = false)
    private UUID buildingId;

    @Column(nullable = false, length = 100)
    private String name;

    /** The level as people say it: -1 for a basement, 0 for the ground floor. Unique per building. */
    @Column(nullable = false)
    private int number;

    /** 0-based display position within the building; changed only by a reorder. */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public Floor(UUID buildingId) {
        this.buildingId = buildingId;
    }
}
