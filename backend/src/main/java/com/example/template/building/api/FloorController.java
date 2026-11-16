package com.example.template.building.api;

import com.example.template.building.dto.FloorOrderRequest;
import com.example.template.building.dto.FloorRequest;
import com.example.template.building.dto.FloorResponse;
import com.example.template.building.service.FloorService;
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

/** Floors of a building. Employees read them (floor selectors); only admins change them. */
@RestController
@RequestMapping("/api/v{version}/buildings/{buildingId}/floors")
public class FloorController {

    private final FloorService floorService;

    public FloorController(FloorService floorService) {
        this.floorService = floorService;
    }

    /** Always in display order. */
    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public List<FloorResponse> list(@PathVariable UUID buildingId) {
        return floorService.list(buildingId);
    }

    @GetMapping(path = "/{floorId}", version = "1")
    @PreAuthorize("isAuthenticated()")
    public FloorResponse getById(@PathVariable UUID buildingId, @PathVariable UUID floorId) {
        return floorService.getById(buildingId, floorId);
    }

    @PostMapping(version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public FloorResponse create(@PathVariable UUID buildingId, @Valid @RequestBody FloorRequest request) {
        return floorService.create(buildingId, request);
    }

    /** Takes every floor id of the building in the new order; answers the floors in that order. */
    @PutMapping(path = "/order", version = "1")
    @AdminOnly
    public List<FloorResponse> reorder(@PathVariable UUID buildingId, @Valid @RequestBody FloorOrderRequest request) {
        return floorService.reorder(buildingId, request);
    }

    @PutMapping(path = "/{floorId}", version = "1")
    @AdminOnly
    public FloorResponse update(
            @PathVariable UUID buildingId, @PathVariable UUID floorId, @Valid @RequestBody FloorRequest request) {
        return floorService.update(buildingId, floorId, request);
    }

    @DeleteMapping(path = "/{floorId}", version = "1")
    @AdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID buildingId, @PathVariable UUID floorId) {
        floorService.delete(buildingId, floorId);
    }
}
