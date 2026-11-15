package com.example.template.building.repository;

import com.example.template.building.model.Equipment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface EquipmentRepository extends JpaRepository<Equipment, UUID> {
    /** JpaRepository already has method findAllByID which we use in ResourceService, so interface can remain empty*/
}