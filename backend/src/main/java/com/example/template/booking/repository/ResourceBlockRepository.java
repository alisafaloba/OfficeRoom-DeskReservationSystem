package com.example.template.booking.repository;

import com.example.template.booking.model.ResourceBlock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ResourceBlockRepository extends JpaRepository<ResourceBlock, UUID> {

    /** Whether an admin block of the resource overlaps the half-open range {@code [from, to)}. */
    default boolean existsOverlapping(UUID resourceId, Instant from, Instant to) {
        return existsByResourceIdAndEndsAtAfterAndStartsAtBefore(resourceId, from, to);
    }

    boolean existsByResourceIdAndEndsAtAfterAndStartsAtBefore(UUID resourceId, Instant from, Instant to);

    /** Ids of the floor's resources with an admin block that overlaps {@code [from, to)}. */
    @Query("""
            select distinct rb.resourceId
            from ResourceBlock rb
            join Resource r on r.id = rb.resourceId
            where r.floorId = :floorId
              and rb.endsAt > :from
              and rb.startsAt < :to
            """)
    List<UUID> findBlockedResourceIdsOnFloor(
            @Param("floorId") UUID floorId, @Param("from") Instant from, @Param("to") Instant to);
}
