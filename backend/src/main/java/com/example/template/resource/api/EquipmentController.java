package com.example.template.resource.api;

import com.example.template.resource.dto.EquipmentRequest;
import com.example.template.resource.dto.EquipmentResponse;
import com.example.template.resource.service.EquipmentService;
import com.example.template.shared.security.AdminOnly;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Shared equipment catalogue.
 * All authenticated users can view the catalogue; only admins can add new equipment.
 */
@RestController
@RequestMapping("/api/v{version}/equipment")
public class EquipmentController {

    private final EquipmentService equipmentService;

    public EquipmentController(EquipmentService equipmentService) {
        this.equipmentService = equipmentService;
    }

    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public List<EquipmentResponse> list() {
        return equipmentService.list();
    }

    @PostMapping(version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public EquipmentResponse create(@Valid @RequestBody EquipmentRequest request) {
        return equipmentService.create(request);
    }
}
