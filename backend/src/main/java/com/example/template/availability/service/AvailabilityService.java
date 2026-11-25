package com.example.template.availability.service;

import com.example.template.availability.dto.AvailabilityStatus;
import com.example.template.availability.dto.BookingSummary;
import com.example.template.availability.dto.FloorAvailabilityResponse;
import com.example.template.availability.dto.ResourceAvailability;
import com.example.template.booking.repository.BookingOverlap;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.booking.repository.ResourceBlockRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.resource.service.ResourceStatusReader;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The status of every resource on a floor for a time range (E4.T1), for colouring the floor plan.
 *
 * <p>A fixed number of queries per call, whatever the floor size: the floor's resources, the
 * overlapping bookings that hold their resource, with the bookers' names, the overlapping admin blocks and the
 * resource statuses. Everything else happens in memory.
 */
@Service
public class AvailabilityService {

    /** The longest range one call may ask for; keeps the response and the scan bounded. */
    static final Duration MAX_RANGE = Duration.ofDays(31);

    private final FloorRepository floorRepository;
    private final ResourceRepository resourceRepository;
    private final BookingRepository bookingRepository;
    private final ResourceBlockRepository resourceBlockRepository;
    private final ResourceStatusReader resourceStatusReader;

    public AvailabilityService(
            FloorRepository floorRepository,
            ResourceRepository resourceRepository,
            BookingRepository bookingRepository,
            ResourceBlockRepository resourceBlockRepository,
            ResourceStatusReader resourceStatusReader) {
        this.floorRepository = floorRepository;
        this.resourceRepository = resourceRepository;
        this.bookingRepository = bookingRepository;
        this.resourceBlockRepository = resourceBlockRepository;
        this.resourceStatusReader = resourceStatusReader;
    }

    /**
     * Every resource of the floor with its status for the half-open range {@code [from, to)}.
     *
     * @throws ApiException INVALID_TIME_RANGE if {@code from} is not before {@code to} or the
     *     range is longer than 31 days; FLOOR_NOT_FOUND for an unknown floor
     */
    @Transactional(readOnly = true)
    public FloorAvailabilityResponse forFloor(
            UUID floorId, Instant from, Instant to, UUID callerId, boolean callerIsAdmin) {
        requireValidRange(from, to);
        if (!floorRepository.existsById(floorId)) {
            throw new ApiException(ErrorCode.FLOOR_NOT_FOUND);
        }

        List<Resource> resources = resourceRepository.findByFloorIdOrderByNameAsc(floorId);
        if (resources.isEmpty()) {
            return new FloorAvailabilityResponse(floorId, from, to, List.of());
        }
        List<UUID> resourceIds = resources.stream().map(Resource::requireId).toList();

        Set<UUID> unavailable = new HashSet<>(resourceStatusReader.unavailableAmong(resourceIds, callerIsAdmin));
        unavailable.addAll(resourceBlockRepository.findBlockedResourceIdsOnFloor(floorId, from, to));

        // groupingBy keeps the query order (earliest first) within each resource.
        Map<UUID, List<BookingSummary>> bookingsByResource =
                bookingRepository.findOccupyingOverlappingOnFloor(floorId, from, to).stream()
                        .collect(Collectors.groupingBy(
                                BookingOverlap::resourceId,
                                Collectors.mapping(overlap -> summarize(overlap, callerId), Collectors.toList())));

        List<ResourceAvailability> result = resources.stream()
                .map(resource -> {
                    UUID id = resource.requireId();
                    List<BookingSummary> bookings = bookingsByResource.getOrDefault(id, List.of());
                    return new ResourceAvailability(
                            id,
                            resource.getName(),
                            resource.getType(),
                            resource.getType().isBookable(),
                            resolveStatus(unavailable.contains(id), bookings),
                            bookings);
                })
                .toList();
        return new FloorAvailabilityResponse(floorId, from, to, result);
    }

    /** UNAVAILABLE > BOOKED_BY_ME > BOOKED > FREE. */
    static AvailabilityStatus resolveStatus(boolean unavailable, List<BookingSummary> overlapping) {
        if (unavailable) {
            return AvailabilityStatus.UNAVAILABLE;
        }
        if (overlapping.stream().anyMatch(BookingSummary::mine)) {
            return AvailabilityStatus.BOOKED_BY_ME;
        }
        return overlapping.isEmpty() ? AvailabilityStatus.FREE : AvailabilityStatus.BOOKED;
    }

    static void requireValidRange(Instant from, Instant to) {
        if (!from.isBefore(to)) {
            throw new ApiException(ErrorCode.INVALID_TIME_RANGE, "'from' must be before 'to'");
        }
        if (Duration.between(from, to).compareTo(MAX_RANGE) > 0) {
            throw new ApiException(ErrorCode.INVALID_TIME_RANGE, "The range may span at most 31 days");
        }
    }

    private static BookingSummary summarize(BookingOverlap overlap, UUID callerId) {
        return new BookingSummary(
                overlap.startsAt(),
                overlap.endsAt(),
                overlap.title(),
                displayName(overlap.firstName(), overlap.lastName()),
                overlap.userId().equals(callerId));
    }

    private static @Nullable String displayName(@Nullable String firstName, @Nullable String lastName) {
        String name = Stream.of(firstName, lastName)
                .filter(part -> part != null && !part.isBlank())
                .map(String::strip)
                .collect(Collectors.joining(" "));
        return name.isEmpty() ? null : name;
    }
}
