package com.example.template.booking.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.jspecify.annotations.Nullable;

/**
 * A reservation of one resource by one user for the half-open range {@code [startsAt, endsAt)}.
 *
 * <p>Resource and user are plain ids, not relations: the database removes bookings with either
 * of them (ON DELETE CASCADE). Only the fields the availability view needs exist so far; the
 * booking flow (E5) extends this entity.
 */
@Entity
@Table(name = "bookings")
@Getter
@Setter
@NoArgsConstructor
public class Booking extends BaseEntity {

    @Column(name = "resource_id", nullable = false)
    private UUID resourceId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Set for meeting-room bookings, empty for desks. */
    @Column(length = 200)
    private @Nullable String title;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status = BookingStatus.ACTIVE;

    public Booking(UUID resourceId, UUID userId, Instant startsAt, Instant endsAt) {
        this.resourceId = resourceId;
        this.userId = userId;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }
}
