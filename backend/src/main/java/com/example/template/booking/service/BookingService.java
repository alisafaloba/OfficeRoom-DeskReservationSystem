package com.example.template.booking.service;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.dto.CreateBookingRequest;
import com.example.template.booking.dto.MoveBookingRequest;
import com.example.template.booking.mapper.BookingMapper;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import com.example.template.shared.security.Role;
import com.example.template.user.repository.UserRepository;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stores bookings and moves them through their lifecycle.
 *
 * <p><b>Conflicts (E5.T2).</b> Two occupying bookings of one resource never overlap. A write
 * locks the target resource for writing, so writers of one resource queue up, then checks for
 * overlaps, so the caller gets a message naming the taken slot. The database exclusion constraint
 * {@value #NO_OVERLAP_CONSTRAINT} is the final guarantee for any write that skips this path.
 * Every conflict ends as 409 BOOKING_CONFLICT, never as 500.
 *
 * <p><b>One desk per user (E5.T3).</b> A DESK booking may not overlap another occupying booking
 * of the same user on a resource of the same type (a desk and a parking spot together are fine).
 * {@link #create} and {@link #move} check it under a per-user lock that is always taken before the
 * resource lock, so parallel requests of one user cannot both pass and the two locks cannot
 * deadlock. Unlike resource overlaps, no database constraint backs this rule: every write path
 * must go through this service.
 *
 * <p><b>Lifecycle (E5.T1).</b> CONFIRMED → CHECKED_IN → COMPLETED, and CONFIRMED → CANCELLED or
 * NO_SHOW. Every other change is rejected with 409 INVALID_BOOKING_STATUS_TRANSITION.
 *
 * <p>Only the order of the states is enforced here, not the time. This service will check in a
 * booking a week early or cancel one that has already ended. The time rules (the check-in window,
 * cancelling only before the start, no-show only after the grace period) belong to the callers,
 * which know the clock and the office settings: check-in, "My bookings" (E5.T6) and the no-show job.
 *
 * <p>Who may trigger a change (owner, admin, the no-show job) is decided by the callers too: the
 * desk and room booking flows, "My bookings" (E5.T6), booking administration (E8) and check-in.
 * Concurrent changes to the same booking surface as 409 CONCURRENT_MODIFICATION through
 * optimistic locking.
 */
@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);

    /** The exclusion constraint on bookings (Liquibase changeset 2026-11-21-13-00). */
    static final String NO_OVERLAP_CONSTRAINT = "ex_bookings_no_overlap";

    /** PostgreSQL's SQLSTATE for exclusion_violation. */
    private static final String EXCLUSION_VIOLATION = "23P01";

    private final BookingRepository bookingRepository;
    private final ResourceRepository resourceRepository;
    private final UserRepository userRepository;
    private final BookingMapper bookingMapper;

    public BookingService(
            BookingRepository bookingRepository,
            ResourceRepository resourceRepository,
            UserRepository userRepository,
            BookingMapper bookingMapper) {
        this.bookingRepository = bookingRepository;
        this.resourceRepository = resourceRepository;
        this.userRepository = userRepository;
        this.bookingMapper = bookingMapper;
    }

    /**
     * Books a resource for {@code userId} as CONFIRMED.
     *
     * <p>The type comes from the caller and is not yet checked against the resource: {@code
     * ResourceType} has no meeting room yet, so every bookable resource is desk-like today. The
     * meeting-room booking flow adds that check (or derives the type from the resource) together
     * with the new resource type.
     *
     * @throws ApiException INVALID_TIME_RANGE if the start is not before the end; VALIDATION_FAILED
     *     if a DESK booking has a title, description or attendees; RESOURCE_NOT_FOUND;
     *     RESOURCE_NOT_BOOKABLE for display-only resources; RESOURCE_UNAVAILABLE in MAINTENANCE, or
     *     RESTRICTED for a non-admin; ATTENDEE_NOT_FOUND if an attendee id is
     *     not a user; USER_ALREADY_HAS_DESK if a DESK booking overlaps another of the user's
     *     bookings on a resource of the same type; BOOKING_CONFLICT if an occupying booking overlaps
     *     the range
     */
    @Transactional
    public BookingResponse create(UUID userId, CreateBookingRequest request) {
        requireValidRange(request.startsAt(), request.endsAt());
        Set<UUID> attendeeIds =
                request.attendeeIds() == null ? Set.of() : new LinkedHashSet<>(request.attendeeIds());
        requireNoMeetingDetailsOnDesk(request, attendeeIds);
        var resource = requireBookableResource(request.resourceId(), userId);
        requireKnownUsers(attendeeIds);
        if (request.type() == BookingType.DESK) {
            requireNoOtherOfSameType(userId, resource.getType(), request.startsAt(), request.endsAt(), null);
        }
        bookingRepository.lockResourceForWriting(request.resourceId());
        requireFree(request.resourceId(), request.startsAt(), request.endsAt(), null);

        var booking = new Booking(request.resourceId(), userId, request.type(), request.startsAt(), request.endsAt());
        booking.setTitle(blankToNull(request.title()));
        booking.setDescription(blankToNull(request.description()));
        booking.getAttendeeIds().addAll(attendeeIds);
        var saved = saveRejectingOverlap(booking);
        log.info("Booking {} created for resource {}", saved.requireId(), saved.getResourceId());
        return bookingMapper.toResponse(saved);
    }

    /**
     * Moves a CONFIRMED booking to a new time and/or resource under the same conflict rule as a
     * new booking. Its own current slot never blocks it, so it can shift by part of its length.
     *
     * @throws ApiException INVALID_TIME_RANGE; BOOKING_NOT_FOUND; BOOKING_NOT_MOVABLE unless
     *     CONFIRMED; RESOURCE_NOT_FOUND, RESOURCE_NOT_BOOKABLE or RESOURCE_UNAVAILABLE for a new
     *     resource;
     *     USER_ALREADY_HAS_DESK if a DESK booking would overlap another of the owner's bookings on a
     *     resource of the same type; BOOKING_CONFLICT if another occupying booking overlaps the new
     *     slot
     */
    @Transactional
    public BookingResponse move(UUID bookingId, MoveBookingRequest request) {
        requireValidRange(request.startsAt(), request.endsAt());
        var booking = find(bookingId);
        if (booking.getStatus() != BookingStatus.CONFIRMED) {
            throw new ApiException(
                    ErrorCode.BOOKING_NOT_MOVABLE, "A " + booking.getStatus() + " booking cannot be moved");
        }
        boolean newResource = !request.resourceId().equals(booking.getResourceId());
        if (newResource || booking.getType() == BookingType.DESK) {
            // A new resource must be bookable for the owner; the current one only supplies its type.
            var resource = newResource
                    ? requireBookableResource(request.resourceId(), booking.getUserId())
                    : requireResource(request.resourceId());
            if (booking.getType() == BookingType.DESK) {
                requireNoOtherOfSameType(
                        booking.getUserId(), resource.getType(), request.startsAt(), request.endsAt(), bookingId);
            }
        }
        bookingRepository.lockResourceForWriting(request.resourceId());
        requireFree(request.resourceId(), request.startsAt(), request.endsAt(), bookingId);

        booking.setResourceId(request.resourceId());
        booking.setStartsAt(request.startsAt());
        booking.setEndsAt(request.endsAt());
        var saved = saveRejectingOverlap(booking);
        log.info(
                "Booking {} moved to resource {} {}..{}",
                bookingId,
                request.resourceId(),
                request.startsAt(),
                request.endsAt());
        return bookingMapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public BookingResponse getById(UUID bookingId) {
        return bookingMapper.toResponse(find(bookingId));
    }

    /** CONFIRMED → CHECKED_IN. */
    @Transactional
    public BookingResponse checkIn(UUID bookingId) {
        return transition(bookingId, BookingStatus.CHECKED_IN, null);
    }

    /** CHECKED_IN → COMPLETED. */
    @Transactional
    public BookingResponse complete(UUID bookingId) {
        return transition(bookingId, BookingStatus.COMPLETED, null);
    }

    /** CONFIRMED → CANCELLED, keeping the optional reason for the booker. */
    @Transactional
    public BookingResponse cancel(UUID bookingId, @Nullable String reason) {
        return transition(bookingId, BookingStatus.CANCELLED, blankToNull(reason));
    }

    /** CONFIRMED → NO_SHOW: not checked in within the grace period; the resource is released. */
    @Transactional
    public BookingResponse markNoShow(UUID bookingId) {
        return transition(bookingId, BookingStatus.NO_SHOW, null);
    }

    private BookingResponse transition(UUID bookingId, BookingStatus next, @Nullable String cancelReason) {
        var booking = find(bookingId);
        BookingStatus current = booking.getStatus();
        if (!current.canTransitionTo(next)) {
            throw new ApiException(
                    ErrorCode.INVALID_BOOKING_STATUS_TRANSITION,
                    "A " + current + " booking cannot become " + next);
        }
        booking.setStatus(next);
        booking.setCancelReason(cancelReason);
        var saved = bookingRepository.saveAndFlush(booking);
        log.info("Booking {} changed from {} to {}", bookingId, current, next);
        return bookingMapper.toResponse(saved);
    }

    /**
     * The resource, if {@code userId} may book it: its type must be bookable, it must not be in
     * MAINTENANCE, and a RESTRICTED one is open to admins only.
     */
    private Resource requireBookableResource(UUID resourceId, UUID userId) {
        var resource = requireResource(resourceId);
        if (!resource.getType().isBookable()) {
            throw new ApiException(ErrorCode.RESOURCE_NOT_BOOKABLE);
        }
        if (resource.getStatus() == ResourceStatus.MAINTENANCE) {
            throw new ApiException(ErrorCode.RESOURCE_UNAVAILABLE);
        }
        if (resource.getStatus() == ResourceStatus.RESTRICTED) {
            boolean isAdmin = userRepository.findById(userId)
                    .map(u -> u.getRole() == Role.ADMIN)
                    .orElse(false);
            if (!isAdmin) {
                throw new ApiException(ErrorCode.RESOURCE_UNAVAILABLE);
            }
        }
        return resource;
    }

    private Resource requireResource(UUID resourceId) {
        return resourceRepository
                .findById(resourceId)
                .orElseThrow(() -> new ApiException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    /**
     * One desk per user: locks the user's desk bookings (before any resource lock, see the class
     * comment), then rejects an overlap with another of the user's occupying bookings on a resource
     * of the same type. {@code exceptId} skips the booking being moved.
     */
    private void requireNoOtherOfSameType(
            UUID userId, ResourceType type, Instant startsAt, Instant endsAt, @Nullable UUID exceptId) {
        bookingRepository.lockUserForWriting(userId);
        boolean taken = bookingRepository.findOccupyingOverlappingIdsForUser(userId, type, startsAt, endsAt).stream()
                .anyMatch(id -> !id.equals(exceptId));
        if (taken) {
            throw new ApiException(
                    ErrorCode.USER_ALREADY_HAS_DESK,
                    "You already have a " + type.noun() + " booked for this time");
        }
    }

    /** A desk booking is a seat for a time; title, description and attendees belong to meeting rooms. */
    private static void requireNoMeetingDetailsOnDesk(CreateBookingRequest request, Set<UUID> attendeeIds) {
        boolean hasMeetingDetails = blankToNull(request.title()) != null
                || blankToNull(request.description()) != null
                || !attendeeIds.isEmpty();
        if (request.type() == BookingType.DESK && hasMeetingDetails) {
            throw new ApiException(
                    ErrorCode.VALIDATION_FAILED, "A desk booking cannot have a title, a description or attendees");
        }
    }

    /**
     * Checks attendees up front: an unknown id would otherwise hit the fk_booking_attendees_user
     * foreign key on insert and surface as a 500.
     */
    private void requireKnownUsers(Set<UUID> userIds) {
        if (!userIds.isEmpty() && userRepository.countByIdIn(userIds) != userIds.size()) {
            throw new ApiException(ErrorCode.ATTENDEE_NOT_FOUND);
        }
    }

    /** The friendly pre-check: names the first taken slot. {@code exceptId} skips the booking being moved. */
    private void requireFree(UUID resourceId, Instant startsAt, Instant endsAt, @Nullable UUID exceptId) {
        bookingRepository.findOccupyingOverlappingForResource(resourceId, startsAt, endsAt).stream()
                .filter(existing -> !existing.requireId().equals(exceptId))
                .findFirst()
                .ifPresent(existing -> {
                    throw new ApiException(
                            ErrorCode.BOOKING_CONFLICT,
                            "The resource is already booked from " + existing.getStartsAt() + " to "
                                    + existing.getEndsAt());
                });
    }

    /**
     * Flushes inside the transaction so a constraint violation surfaces here, not at commit, and
     * turns the exclusion violation into BOOKING_CONFLICT. Any other integrity error stays a bug.
     */
    private Booking saveRejectingOverlap(Booking booking) {
        try {
            return bookingRepository.saveAndFlush(booking);
        } catch (DataIntegrityViolationException e) {
            if (isOverlapViolation(e)) {
                log.info("Booking for resource {} lost a race for its slot", booking.getResourceId());
                throw new ApiException(
                        ErrorCode.BOOKING_CONFLICT, "The resource was just booked for this time by someone else");
            }
            throw e;
        }
    }

    static boolean isOverlapViolation(DataIntegrityViolationException e) {
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(e);
        return cause instanceof SQLException sql
                && EXCLUSION_VIOLATION.equals(sql.getSQLState())
                && Objects.toString(sql.getMessage(), "").contains(NO_OVERLAP_CONSTRAINT);
    }

    private static void requireValidRange(Instant startsAt, Instant endsAt) {
        if (!startsAt.isBefore(endsAt)) {
            throw new ApiException(ErrorCode.INVALID_TIME_RANGE, "'startsAt' must be before 'endsAt'");
        }
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private Booking find(UUID bookingId) {
        return bookingRepository
                .findById(bookingId)
                .orElseThrow(() -> new ApiException(ErrorCode.BOOKING_NOT_FOUND));
    }
}
