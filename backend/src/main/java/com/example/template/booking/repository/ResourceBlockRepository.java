package com.example.template.booking.repository;

import com.example.template.booking.model.ResourceBlock;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceBlockRepository extends JpaRepository<ResourceBlock, UUID> {}
