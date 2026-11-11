package com.example.template.resource.api;

import com.example.template.resource.dto.ResourceRequest;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.service.ResourceService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Resources on a floor (desks, phone booths, parking spots, break rooms).
 * Employees read them (to browse and book); only admins change them.
 */
@RestController
@RequestMapping("/api/v{version}/floors/{floorId}/resources")
public class ResourceController {

    private final ResourceService resourceService;

    public ResourceController(ResourceService resourceService) {
        this.resourceService = resourceService;
    }

    /**
     * Lists resources on a floor. The optional {@code type} query parameter filters by resource
     * type (e.g. {@code ?type=DESK}), enabling search by type.
     */
    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public List<ResourceResponse> list(
            @PathVariable UUID floorId,
            @RequestParam(required = false) ResourceType type) {
        return resourceService.list(floorId, type);
    }

    @GetMapping(path = "/{resourceId}", version = "1")
    @PreAuthorize("isAuthenticated()")
    public ResourceResponse getById(@PathVariable UUID floorId, @PathVariable UUID resourceId) {
        return resourceService.getById(floorId, resourceId);
    }

    @PostMapping(version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public ResourceResponse create(
            @PathVariable UUID floorId, @Valid @RequestBody ResourceRequest request) {
        return resourceService.create(floorId, request);
    }

    @PutMapping(path = "/{resourceId}", version = "1")
    @AdminOnly
    public ResourceResponse update(
            @PathVariable UUID floorId,
            @PathVariable UUID resourceId,
            @Valid @RequestBody ResourceRequest request) {
        return resourceService.update(floorId, resourceId, request);
    }

    @DeleteMapping(path = "/{resourceId}", version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID floorId, @PathVariable UUID resourceId) {
        resourceService.delete(floorId, resourceId);
    }
}
