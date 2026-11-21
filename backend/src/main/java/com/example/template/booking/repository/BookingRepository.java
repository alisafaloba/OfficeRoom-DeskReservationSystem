package com.example.template.booking.repository;

import com.example.template.booking.model.Booking;
import com.example.template.booking.model.BookingStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingRepository extends JpaRepository<Booking, UUID> {

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
