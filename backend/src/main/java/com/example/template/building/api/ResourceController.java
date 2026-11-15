package com.example.template.building.api;

import com.example.template.building.dto.ResourceRequest;
import com.example.template.building.dto.ResourceResponse;
import com.example.template.building.mapper.ResourceMapper;
import com.example.template.building.model.Resource;
import com.example.template.building.service.ResourceService;
import com.example.template.shared.security.AdminOnly;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Employees read resources; only admins create, edit or delete them. */
@RestController
@RequestMapping("/api/v{version}/floors/{floorId}/resources")
public class ResourceController {

    private final ResourceService resourceService;
    private final ResourceMapper resourceMapper;

    public ResourceController(ResourceService resourceService, ResourceMapper resourceMapper) {
        this.resourceService = resourceService;
        this.resourceMapper = resourceMapper;
    }

    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public List<ResourceResponse> getResources(
            @PathVariable UUID floorId,
            @RequestParam(required = false) Resource.ResourceType type,
            @RequestParam(required = false) UUID equipmentId) {

        return resourceService.getResourcesByFloor(floorId, type, equipmentId).stream()
                .map(resourceMapper::toResponse)
                .toList();
    }

    @PostMapping(version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public ResourceResponse createResource(
            @PathVariable UUID floorId,
            @Valid @RequestBody ResourceRequest request) {

        Resource savedResource = resourceService.createResource(floorId, request);
        return resourceMapper.toResponse(savedResource);
    }

    @PutMapping(path = "/{resourceId}", version = "1")
    @AdminOnly
    public ResourceResponse updateResource(
            @PathVariable UUID floorId,
            @PathVariable UUID resourceId,
            @Valid @RequestBody ResourceRequest request) {

        Resource updatedResource = resourceService.updateResource(floorId, resourceId, request);
        return resourceMapper.toResponse(updatedResource);
    }

    @DeleteMapping(path = "/{resourceId}", version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteResource(
            @PathVariable UUID floorId,
            @PathVariable UUID resourceId) {

        resourceService.deleteResource(floorId, resourceId);
    }
}