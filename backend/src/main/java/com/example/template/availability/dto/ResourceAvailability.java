package com.example.template.availability.dto;

import com.example.template.resource.dto.ResourceType;
import java.util.List;
import java.util.UUID;

/**
 * One resource of the floor with its status for the requested range.
 *
 * @param bookable false for display-only resources (break rooms); they are never booked and the
 *     viewer draws them neutrally
 * @param bookings the bookings that hold the resource during the range, earliest first
 */
public record ResourceAvailability(
        UUID resourceId,
        String name,
        ResourceType type,
        boolean bookable,
        AvailabilityStatus status,
        List<BookingSummary> bookings) {}
