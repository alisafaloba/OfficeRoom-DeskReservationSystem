package com.example.template.resource.repository;

import com.example.template.resource.model.Equipment;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EquipmentRepository extends JpaRepository<Equipment, UUID> {
    List<Equipment> findAllByOrderByNameAsc();

    boolean existsByNameIgnoreCase(String name);

    Optional<Equipment> findByNameIgnoreCase(String name);
}