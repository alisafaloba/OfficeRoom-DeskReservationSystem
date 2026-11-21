package com.example.template.booking.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.jspecify.annotations.Nullable;

/**
 * A reservation of one resource by one user for the half-open range {@code [startsAt, endsAt)}.
 *
 * <p>Resource, user and attendees are plain ids, not relations: the database removes bookings
 * (and attendee rows) with their resource or user (ON DELETE CASCADE).
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingType type;

    /** Set for meeting-room bookings, empty for desks. */
    @Column(length = 200)
    private @Nullable String title;

    @Column(length = 2000)
    private @Nullable String description;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status = BookingStatus.CONFIRMED;

    /** Why the booking was cancelled; only ever set together with {@link BookingStatus#CANCELLED}. */
    @Column(name = "cancel_reason", length = 500)
    private @Nullable String cancelReason;

    /**
     * The colleagues invited to a meeting-room booking, as user ids (rows of
     * {@code booking_attendees}). Always empty for desk bookings.
     */
    @ElementCollection
    @CollectionTable(name = "booking_attendees", joinColumns = @JoinColumn(name = "booking_id"))
    @Column(name = "user_id", nullable = false)
    private Set<UUID> attendeeIds = new HashSet<>();

    public Booking(UUID resourceId, UUID userId, BookingType type, Instant startsAt, Instant endsAt) {
        this.resourceId = resourceId;
        this.userId = userId;
        this.type = type;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }
}
