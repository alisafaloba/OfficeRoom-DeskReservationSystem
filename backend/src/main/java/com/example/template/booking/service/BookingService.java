package com.example.template.booking.service;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.CreateBookingRequest;
import com.example.template.booking.dto.MoveBookingRequest;
import com.example.template.booking.mapper.BookingMapper;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
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
     * @throws ApiException INVALID_TIME_RANGE if the start is not before the end; RESOURCE_NOT_FOUND;
     *     RESOURCE_NOT_BOOKABLE for display-only resources; ATTENDEE_NOT_FOUND if an attendee id is
     *     not a user; BOOKING_CONFLICT if an occupying booking overlaps the range
     */
    @Transactional
    public BookingResponse create(UUID userId, CreateBookingRequest request) {
        requireValidRange(request.startsAt(), request.endsAt());
        requireBookableResource(request.resourceId());
        Set<UUID> attendeeIds =
                request.attendeeIds() == null ? Set.of() : new LinkedHashSet<>(request.attendeeIds());
        requireKnownUsers(attendeeIds);
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
     *     CONFIRMED; RESOURCE_NOT_FOUND or RESOURCE_NOT_BOOKABLE for a new resource; BOOKING_CONFLICT
     *     if another occupying booking overlaps the new slot
     */
    @Transactional
    public BookingResponse move(UUID bookingId, MoveBookingRequest request) {
        requireValidRange(request.startsAt(), request.endsAt());
        var booking = find(bookingId);
        if (booking.getStatus() != BookingStatus.CONFIRMED) {
            throw new ApiException(
                    ErrorCode.BOOKING_NOT_MOVABLE, "A " + booking.getStatus() + " booking cannot be moved");
        }
        if (!request.resourceId().equals(booking.getResourceId())) {
            requireBookableResource(request.resourceId());
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

    private void requireBookableResource(UUID resourceId) {
        var resource = resourceRepository
                .findById(resourceId)
                .orElseThrow(() -> new ApiException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!resource.getType().isBookable()) {
            throw new ApiException(ErrorCode.RESOURCE_NOT_BOOKABLE);
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
