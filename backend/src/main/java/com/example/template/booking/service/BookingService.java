package com.example.template.booking.service;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.mapper.BookingMapper;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The booking status lifecycle (E5.T1): CONFIRMED → CHECKED_IN → COMPLETED, and CONFIRMED →
 * CANCELLED or NO_SHOW. Every other change is rejected with 409 INVALID_BOOKING_STATUS_TRANSITION.
 *
 * <p>Who may trigger a change (owner, admin, the no-show job) is decided by the callers: the
 * desk and room booking flows, "My bookings" (E5.T6), booking administration (E8) and check-in.
 * Concurrent changes to the same booking surface as 409 CONCURRENT_MODIFICATION through
 * optimistic locking.
 */
@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);

    private final BookingRepository bookingRepository;
    private final BookingMapper bookingMapper;

    public BookingService(BookingRepository bookingRepository, BookingMapper bookingMapper) {
        this.bookingRepository = bookingRepository;
        this.bookingMapper = bookingMapper;
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
        String cleaned = reason == null || reason.isBlank() ? null : reason.strip();
        return transition(bookingId, BookingStatus.CANCELLED, cleaned);
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

    private Booking find(UUID bookingId) {
        return bookingRepository
                .findById(bookingId)
                .orElseThrow(() -> new ApiException(ErrorCode.BOOKING_NOT_FOUND));
    }
}
