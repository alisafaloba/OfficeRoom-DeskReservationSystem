package com.example.template.booking.repository;

import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.model.Booking;
import com.example.template.resource.dto.ResourceType;
import java.time.Instant;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Every range query uses the half-open overlap rule: a booking overlaps {@code [from, to)} when
 * {@code startsAt < to} and {@code endsAt > from}. Any overlap counts, however short; touching
 * ends do not. Queries that return bookings load the attendee ids in the same round trip.
 */
public interface BookingRepository extends JpaRepository<Booking, UUID> {

    /**
     * The bookings that hold the resource ({@link BookingStatus#OCCUPYING}) during any part of
     * {@code [from, to)}, earliest first. Empty means the resource is free for the whole range.
     */
    default List<Booking> findOccupyingOverlappingForResource(UUID resourceId, Instant from, Instant to) {
        return findOverlappingForResource(resourceId, from, to, BookingStatus.OCCUPYING);
    }

    /** Every booking of the resource that overlaps {@code [from, to)}, in any status, earliest first. */
    default List<Booking> findAllOverlappingForResource(UUID resourceId, Instant from, Instant to) {
        return findOverlappingForResource(resourceId, from, to, EnumSet.allOf(BookingStatus.class));
    }

    /**
     * Takes a transaction-scoped advisory lock for writing bookings of this resource; it is
     * released at commit or rollback. Writers of the same resource then queue up instead of
     * racing: without it, concurrent writes that collide on the exclusion constraint can wait on
     * each other and fail as a deadlock (SQLSTATE 40P01) instead of a clean conflict. Writers of
     * different resources never block each other. Must run inside the writing transaction.
     */
    @Query(
            value = "SELECT count(*) FROM"
                    + " (SELECT pg_advisory_xact_lock(hashtextextended(CAST(:resourceId AS text), 0))) l",
            nativeQuery = true)
    long lockResourceForWriting(@Param("resourceId") UUID resourceId);

    /**
     * Takes a transaction-scoped advisory lock for the user's own desk bookings, so two parallel
     * requests of one user cannot both pass the one-desk-per-slot check (E5.T3). Taken before
     * {@link #lockResourceForWriting}, never after, so the two locks cannot deadlock. The {@code
     * user:} prefix keeps it apart from the resource locks.
     */
    @Query(
            value = "SELECT count(*) FROM"
                    + " (SELECT pg_advisory_xact_lock(hashtextextended('user:' || CAST(:userId AS text), 0))) l",
            nativeQuery = true)
    long lockUserForWriting(@Param("userId") UUID userId);

    /**
     * Ids of the user's bookings that hold a resource ({@link BookingStatus#OCCUPYING}) of the
     * given type during any part of {@code [from, to)}. Served by the (user_id, ends_at) index, so
     * only bookings that end after {@code from} are read, not the user's whole history.
     */
    default List<UUID> findOccupyingOverlappingIdsForUser(UUID userId, ResourceType type, Instant from, Instant to) {
        return findOverlappingIdsForUser(userId, type, from, to, BookingStatus.OCCUPYING);
    }

    @Query("""
            select b.id from Booking b
            join Resource r on r.id = b.resourceId
            where b.userId = :userId
              and r.type = :type
              and b.status in :statuses
              and b.endsAt > :from
              and b.startsAt < :to
            """)
    List<UUID> findOverlappingIdsForUser(
            @Param("userId") UUID userId,
            @Param("type") ResourceType type,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("statuses") Collection<BookingStatus> statuses);

    /** Served by the (resource_id, starts_at, ends_at) index. */
    @EntityGraph(attributePaths = "attendeeIds")
    @Query("""
            select b from Booking b
            where b.resourceId = :resourceId
              and b.status in :statuses
              and b.endsAt > :from
              and b.startsAt < :to
            order by b.startsAt, b.endsAt
            """)
    List<Booking> findOverlappingForResource(
            @Param("resourceId") UUID resourceId,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("statuses") Collection<BookingStatus> statuses);

    /**
     * The user's own bookings that overlap {@code [from, to)}, in any status, earliest first.
     * Served by the (user_id, starts_at) index.
     */
    @EntityGraph(attributePaths = "attendeeIds")
    @Query("""
            select b from Booking b
            where b.userId = :userId
              and b.endsAt > :from
              and b.startsAt < :to
            order by b.startsAt, b.endsAt
            """)
    List<Booking> findOverlappingForUser(
            @Param("userId") UUID userId, @Param("from") Instant from, @Param("to") Instant to);

    /**
     * Bookings of the floor's resources that hold their resource ({@link BookingStatus#OCCUPYING})
     * and overlap the half-open range {@code [from, to)}, earliest first. Any overlap counts,
     * however short; a booking that ends exactly at {@code from} or starts exactly at {@code to}
     * does not.
     */
    default List<BookingOverlap> findOccupyingOverlappingOnFloor(UUID floorId, Instant from, Instant to) {
        return findOverlappingOnFloor(floorId, from, to, BookingStatus.OCCUPYING);
    }

    @Query("""
            select new com.example.template.booking.repository.BookingOverlap(
                b.resourceId, b.userId, b.title, b.startsAt, b.endsAt, u.firstName, u.lastName)
            from Booking b
            join Resource r on r.id = b.resourceId
            join User u on u.id = b.userId
            where r.floorId = :floorId
              and b.status in :statuses
              and b.endsAt > :from
              and b.startsAt < :to
            order by b.startsAt, b.endsAt
            """)
    List<BookingOverlap> findOverlappingOnFloor(
            @Param("floorId") UUID floorId,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("statuses") Collection<BookingStatus> statuses);
}
