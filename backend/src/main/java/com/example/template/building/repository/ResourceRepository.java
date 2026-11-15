package com.example.template.building.repository;

import com.example.template.building.model.Resource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ResourceRepository extends JpaRepository<Resource, UUID> {
    @Query("""
        SELECT DISTINCT r FROM Resource r
        LEFT JOIN r.equipments e
        WHERE r.floorId = :floorId
        AND (:type IS NULL OR r.type = :type)
        AND (:equipmentId IS NULL OR e.id = :equipmentId)
    """)
    List<Resource> findByFloorIdWithFilters(
            @Param("floorId") UUID floorId,
            @Param("type") Resource.ResourceType type,
            @Param("equipmentId") UUID equipmentId
    );
    /** verifies if label exists on this floor for create*/
    boolean existsByFloorIdAndLabel(UUID floorId, String label);

    /** verifies unique excluding current resource for update*/
    boolean existsByFloorIdAndLabelAndIdNot(UUID floorId, String label, UUID id);
}