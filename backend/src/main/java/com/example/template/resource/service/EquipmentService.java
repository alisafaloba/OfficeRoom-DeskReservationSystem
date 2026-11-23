package com.example.template.resource.service;

import com.example.template.resource.dto.EquipmentRequest;
import com.example.template.resource.dto.EquipmentResponse;
import com.example.template.resource.model.Equipment;
import com.example.template.resource.repository.EquipmentRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Shared equipment catalogue. Reads are open to every authenticated user;
 * additions are restricted to administrators.
 */
@Service
public class EquipmentService {

    private static final Logger log = LoggerFactory.getLogger(EquipmentService.class);

    private final EquipmentRepository equipmentRepository;

    public EquipmentService(EquipmentRepository equipmentRepository) {
        this.equipmentRepository = equipmentRepository;
    }

    /**
     * Lists all equipment types in alphabetical order.
     */
    @Transactional(readOnly = true)
    public List<EquipmentResponse> list() {
        return equipmentRepository.findAllByOrderByNameAsc().stream()
                .map(eq -> new EquipmentResponse(eq.requireId(), eq.getName()))
                .toList();
    }

    /**
     * Adds a new equipment type to the shared catalogue.
     */
    @Transactional
    public EquipmentResponse create(EquipmentRequest request) {
        String cleanName = request.name().strip();
        if (equipmentRepository.existsByNameIgnoreCase(cleanName)) {
            throw new ApiException(ErrorCode.EQUIPMENT_NAME_ALREADY_IN_USE);
        }

        Equipment equipment = new Equipment();
        equipment.setName(cleanName);
        try {
            Equipment saved = equipmentRepository.saveAndFlush(equipment);
            log.info("Equipment {} ('{}') added to catalogue", saved.requireId(), saved.getName());
            return new EquipmentResponse(saved.requireId(), saved.getName());
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            throw new ApiException(ErrorCode.EQUIPMENT_NAME_ALREADY_IN_USE);
        }
    }
}
