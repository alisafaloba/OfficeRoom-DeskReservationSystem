package com.example.template.floorplan.api;

import com.example.template.floorplan.dto.FloorPlanRequest;
import com.example.template.floorplan.dto.FloorPlanResponse;
import com.example.template.floorplan.service.FloorPlanService;
import com.example.template.shared.security.AdminOnly;
import com.example.template.shared.security.AuthPrincipal;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The plan of a floor. Everyone signed in can load it (viewer); only admins save it (editor). */
@RestController
@RequestMapping("/api/v{version}/floors/{floorId}/plan")
public class FloorPlanController {

    private final FloorPlanService floorPlanService;

    public FloorPlanController(FloorPlanService floorPlanService) {
        this.floorPlanService = floorPlanService;
    }

    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public FloorPlanResponse get(@PathVariable UUID floorId) {
        return floorPlanService.get(floorId);
    }

    /**
     * Replaces the plan. Send the version you loaded (null for a floor without a plan); a stale
     * version is 409 and nothing is overwritten.
     */
    @PutMapping(version = "1")
    @AdminOnly
    public FloorPlanResponse save(
            @PathVariable UUID floorId,
            @Valid @RequestBody FloorPlanRequest request,
            @AuthenticationPrincipal AuthPrincipal principal) {
        return floorPlanService.save(floorId, request, principal.userId());
    }
}
