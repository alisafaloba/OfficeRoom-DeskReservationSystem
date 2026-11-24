package com.example.template.resource.repository;

import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceRepository extends JpaRepository<Resource, UUID> {

    /** All resources of a floor, ordered by name. */
    List<Resource> findByFloorIdOrderByNameAsc(UUID floorId);

    /** All resources of a floor filtered by type, ordered by name. */
    List<Resource> findByFloorIdAndTypeOrderByNameAsc(UUID floorId, ResourceType type);

    /** A resource that belongs to the given floor, or empty if the floor does not own it. */
    Optional<Resource> findByIdAndFloorId(UUID id, UUID floorId);
}
