package com.example.template.availability.api;

import com.example.template.availability.dto.FloorAvailabilityResponse;
import com.example.template.availability.service.AvailabilityService;
import com.example.template.shared.security.AuthPrincipal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Floor plan colours (E4.T1): the status of every resource on a floor for a time range. */
@RestController
@RequestMapping("/api/v{version}/floors/{floorId}/availability")
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    public AvailabilityController(AvailabilityService availabilityService) {
        this.availabilityService = availabilityService;
    }

    /**
     * {@code from} and {@code to} are ISO-8601 instants in UTC (e.g. {@code 2026-12-01T08:00:00Z});
     * the viewer converts from the building's time zone. The range is half-open and at most 31
     * days long.
     */
    @GetMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    public FloorAvailabilityResponse forFloor(
            @PathVariable UUID floorId,
            @RequestParam Instant from,
            @RequestParam Instant to,
            @AuthenticationPrincipal AuthPrincipal principal) {
        return availabilityService.forFloor(floorId, from, to, principal.userId());
    }
}
