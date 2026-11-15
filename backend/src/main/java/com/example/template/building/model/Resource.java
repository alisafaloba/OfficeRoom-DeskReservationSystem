package com.example.template.building.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A bookable resource (desk or meeting room) belonging to a floor.
 *
 * <p>Like the floor->building relation, the floor is a plain id, not a {@code @ManyToOne}:
 * the database removes resources with their floor (ON DELETE CASCADE).
 */
@Entity
@Table(name = "resources")
@Getter
@Setter
@NoArgsConstructor
public class Resource extends BaseEntity {

    public enum ResourceType {
        DESK,
        MEETING_ROOM
    }

    @Column(name = "floor_id", nullable = false, updatable = false)
    private UUID floorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private ResourceType type;

    @Column(nullable = false, length = 255)
    private String label;

    @Column(nullable = false)
    private int capacity;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(length = 50)
    private String status;

    @ManyToMany
    @JoinTable(
            name = "resource_equipment",
            joinColumns = @JoinColumn(name = "resource_id"),
            inverseJoinColumns = @JoinColumn(name = "equipment_id")
    )
    private Set<Equipment> equipments = new HashSet<>();

    public Resource(UUID floorId) {
        this.floorId = floorId;
    }
}