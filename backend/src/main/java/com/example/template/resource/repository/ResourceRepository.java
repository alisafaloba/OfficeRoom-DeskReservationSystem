package com.example.template.resource.repository;

import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.jspecify.annotations.Nullable;

public interface ResourceRepository extends JpaRepository<Resource, UUID> {

    @Query("""
        SELECT DISTINCT r FROM Resource r
        LEFT JOIN r.equipments e
        WHERE r.floorId = :floorId
        AND (:type IS NULL OR r.type = :type)
        AND (:equipmentId IS NULL OR e.id = :equipmentId)
        ORDER BY r.name ASC
    """)
    List<Resource> findByFloorIdWithFilters(
            @Param("floorId") UUID floorId,
            @Param("type") @Nullable ResourceType type,
            @Param("equipmentId") @Nullable UUID equipmentId);

    Optional<Resource> findByIdAndFloorId(UUID id, UUID floorId);

    boolean existsByFloorIdAndName(UUID floorId, String name);

    boolean existsByFloorIdAndNameAndIdNot(UUID floorId, String name, UUID id);
}