package com.example.template.resource.repository;

import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ResourceRepository extends JpaRepository<Resource, UUID> {

    /**
     * All resources of a floor matching optional type and equipment filters, ordered by name.
     * Fetches equipment eagerly in a single query via an entity graph to avoid N+1 queries.
     */
    @EntityGraph(attributePaths = "equipments")
    @Query("""
        SELECT r FROM Resource r
        WHERE r.floorId = :floorId
          AND (:type IS NULL OR r.type = :type)
          AND (:equipmentId IS NULL OR EXISTS (
                SELECT 1 FROM Resource r2 JOIN r2.equipments e
                WHERE r2 = r AND e.id = :equipmentId))
        ORDER BY r.name ASC
        """)
    List<Resource> findByFloorIdWithFilters(
            @Param("floorId") UUID floorId,
            @Param("type") @Nullable ResourceType type,
            @Param("equipmentId") @Nullable UUID equipmentId);

    /** All resources of a floor, ordered by name. */
    List<Resource> findByFloorIdOrderByNameAsc(UUID floorId);

    /** Finds the subset of given resource IDs having one of the specified statuses. */
    @Query("SELECT r.id FROM Resource r WHERE r.id IN :resourceIds AND r.status IN :statuses")
    Set<UUID> findIdsByIdInAndStatusIn(
            @Param("resourceIds") Collection<UUID> resourceIds,
            @Param("statuses") Collection<ResourceStatus> statuses);

    /** A resource that belongs to the given floor, or empty if the floor does not own it. */
    Optional<Resource> findByIdAndFloorId(UUID id, UUID floorId);

    /** Checks whether a resource with the given name already exists on the floor (case-insensitive). */
    boolean existsByFloorIdAndNameIgnoreCase(UUID floorId, String name);

    /** Checks whether another resource on the floor already uses the given name (case-insensitive). */
    boolean existsByFloorIdAndNameIgnoreCaseAndIdNot(UUID floorId, String name, UUID id);
}