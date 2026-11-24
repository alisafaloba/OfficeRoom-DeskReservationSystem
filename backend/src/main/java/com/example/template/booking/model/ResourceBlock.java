package com.example.template.booking.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.jspecify.annotations.Nullable;

/**
 * An admin block (E8.T4): the resource cannot be booked during {@code [startsAt, endsAt)}.
 *
 * <p>The resource is a plain id: the database removes blocks with their resource (ON DELETE
 * CASCADE). Open-ended unavailability ("until further notice") is the resource status (E2.T4),
 * not a block.
 */
@Entity
@Table(name = "resource_blocks")
@Getter
@Setter
@NoArgsConstructor
public class ResourceBlock extends BaseEntity {

    @Column(name = "resource_id", nullable = false)
    private UUID resourceId;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    /** Why the resource is blocked (maintenance, company event); shown to admins. */
    @Column(length = 500)
    private @Nullable String reason;

    public ResourceBlock(UUID resourceId, Instant startsAt, Instant endsAt) {
        this.resourceId = resourceId;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }
}
