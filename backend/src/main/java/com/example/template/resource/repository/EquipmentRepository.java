package com.example.template.resource.repository;

import com.example.template.resource.model.Equipment;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EquipmentRepository extends JpaRepository<Equipment, UUID> {}