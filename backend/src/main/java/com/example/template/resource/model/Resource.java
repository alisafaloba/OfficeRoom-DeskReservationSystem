package com.example.template.resource.model;

import com.example.template.resource.dto.ResourceType;
import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A bookable or display-only resource on a floor (desk, phone booth, parking spot, break room).
 *
 * <p>The floor is a plain id, not a {@code @ManyToOne}: the database removes resources with their
 * floor (ON DELETE CASCADE), and a JPA relation with its own cascade would fight that.
 */
@Entity
@Table(name = "resources")
@Getter
@Setter
@NoArgsConstructor
public class Resource extends BaseEntity {

    @Column(name = "floor_id", nullable = false, updatable = false)
    private UUID floorId;

    @Column(nullable = false, length = 100)
    private String name;

    /**
     * The kind of resource; determines whether it can be booked and which icon appears on the plan.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ResourceType type;

    public Resource(UUID floorId) {
        this.floorId = floorId;
    }
}
