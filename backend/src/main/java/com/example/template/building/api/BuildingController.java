package com.example.template.building.api;

import com.example.template.building.dto.BuildingRequest;
import com.example.template.building.dto.BuildingResponse;
import com.example.template.building.service.BuildingService;
import com.example.template.shared.security.AdminOnly;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Employees read buildings (selectors); only admins change them. */
@RestController
@RequestMapping("/api/v{version}/buildings")
public class BuildingController {

    private final BuildingService buildingService;

    public BuildingController(BuildingService buildingService) {
        this.buildingService = buildingService;
    }

    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public List<BuildingResponse> list() {
        return buildingService.list();
    }

    @GetMapping(path = "/{id}", version = "1")
    @PreAuthorize("isAuthenticated()")
    public BuildingResponse getById(@PathVariable UUID id) {
        return buildingService.getById(id);
    }

    @PostMapping(version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public BuildingResponse create(@Valid @RequestBody BuildingRequest request) {
        return buildingService.create(request);
    }

    @PutMapping(path = "/{id}", version = "1")
    @AdminOnly
    public BuildingResponse update(@PathVariable UUID id, @Valid @RequestBody BuildingRequest request) {
        return buildingService.update(id, request);
    }

    @DeleteMapping(path = "/{id}", version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        buildingService.delete(id);
    }
}
