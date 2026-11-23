package com.example.template.booking.api;

import com.example.template.booking.dto.DeskBookingRequest;
import com.example.template.booking.dto.DeskBookingResponse;
import com.example.template.booking.service.DeskBookingService;
import com.example.template.shared.security.AuthPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Desk booking (E5.T3): every signed-in user books desks for themselves. */
@RestController
@RequestMapping("/api/v{version}/bookings/desk")
public class DeskBookingController {

    private final DeskBookingService deskBookingService;

    public DeskBookingController(DeskBookingService deskBookingService) {
        this.deskBookingService = deskBookingService;
    }

    /** The date and times are in the building's time zone; see {@link DeskBookingRequest}. */
    @PostMapping(version = "1")
    @PreAuthorize("isAuthenticated()")
    @ResponseStatus(HttpStatus.CREATED)
    public DeskBookingResponse book(
            @Valid @RequestBody DeskBookingRequest request, @AuthenticationPrincipal AuthPrincipal principal) {
        return deskBookingService.book(principal.userId(), request);
    }
}
