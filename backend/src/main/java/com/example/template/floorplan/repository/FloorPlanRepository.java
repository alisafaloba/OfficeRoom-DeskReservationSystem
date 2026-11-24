package com.example.template.floorplan.repository;

import com.example.template.floorplan.model.FloorPlan;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FloorPlanRepository extends JpaRepository<FloorPlan, UUID> {

    Optional<FloorPlan> findByFloorId(UUID floorId);
}
