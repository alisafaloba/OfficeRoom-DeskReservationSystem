package com.example.template.booking.service;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.dto.CreateBookingRequest;
import com.example.template.booking.dto.DeskBookingMode;
import com.example.template.booking.dto.DeskBookingRequest;
import com.example.template.booking.dto.DeskBookingResponse;
import com.example.template.booking.repository.ResourceBlockRepository;
import com.example.template.booking.service.DeskSlotResolver.LocalSlot;
import com.example.template.building.model.Building;
import com.example.template.building.model.OpeningHours;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.resource.service.ResourceStatusReader;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The desk booking flow (E5.T3): a full day, a morning, an afternoon or a custom slot, all in the
 * building's opening hours and time zone. Desk-like resources (desks, phone booths, parking
 * spots) follow this flow.
 *
 * <p>The checks run in this order: the resource exists and is bookable; the date is at most
 * {@code app.booking.desk.max-days-ahead} days (default 90) after today; the slot fits the
 * building's opening hours that day; it is not in the past; the resource is not blocked or out of
 * service; then {@link BookingService#create} enforces one desk per user (409
 * USER_ALREADY_HAS_DESK) and rejects an overlapping booking of the desk (409 BOOKING_CONFLICT),
 * each under its lock.
 *
 * <p><b>Today.</b> A full or half day of today that has already begun starts at the next
 * 15-minute mark instead of being rejected: "Full day" at 10:07 books 10:15 until closing. A
 * custom slot is taken as picked and is rejected if its start has passed.
 *
 * <p>TODO(E8.T5): the booking rules (maximum duration, per-user limits, and how far ahead, which
 * replaces {@code max-days-ahead}) go between the past check and the availability check.
 */
@Service
public class DeskBookingService {

    private final ResourceRepository resourceRepository;
    private final FloorRepository floorRepository;
    private final BuildingRepository buildingRepository;
    private final ResourceBlockRepository resourceBlockRepository;
    private final ResourceStatusReader resourceStatusReader;
    private final BookingService bookingService;
    private final DeskBookingProperties properties;
    private final Clock clock;

    public DeskBookingService(
            ResourceRepository resourceRepository,
            FloorRepository floorRepository,
            BuildingRepository buildingRepository,
            ResourceBlockRepository resourceBlockRepository,
            ResourceStatusReader resourceStatusReader,
            BookingService bookingService,
            DeskBookingProperties properties,
            Clock clock) {
        this.resourceRepository = resourceRepository;
        this.floorRepository = floorRepository;
        this.buildingRepository = buildingRepository;
        this.resourceBlockRepository = resourceBlockRepository;
        this.resourceStatusReader = resourceStatusReader;
        this.bookingService = bookingService;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * Books the desk for {@code userId} as CONFIRMED.
     *
     * @throws ApiException RESOURCE_NOT_FOUND; RESOURCE_NOT_BOOKABLE; BOOKING_TOO_FAR_AHEAD;
     *     OUTSIDE_OPENING_HOURS,
     *     INVALID_TIME_RANGE or VALIDATION_FAILED from the slot (see {@link DeskSlotResolver});
     *     BOOKING_IN_PAST; RESOURCE_UNAVAILABLE if the desk is blocked or out of service;
     *     USER_ALREADY_HAS_DESK if the user holds another one of the same type then;
     *     BOOKING_CONFLICT if someone else holds it
     */
    @Transactional
    public DeskBookingResponse book(UUID userId, DeskBookingRequest request) {
        Resource resource = resourceRepository
                .findById(request.resourceId())
                .orElseThrow(() -> new ApiException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!resource.getType().isBookable()) {
            throw new ApiException(ErrorCode.RESOURCE_NOT_BOOKABLE);
        }
        Building building = buildingOf(resource);
        ZoneId zone = ZoneId.of(building.getTimeZone());
        requireWithinHorizon(request.date(), LocalDate.now(clock.withZone(zone)), properties.maxDaysAhead());

        OpeningHours hours = hoursOn(building, request.date().getDayOfWeek());
        LocalSlot slot = DeskSlotResolver.resolve(
                request.mode(),
                hours.getOpensAt(),
                hours.getClosesAt(),
                properties.halfDaySplit(),
                request.startTime(),
                request.endTime());
        Instant endsAt = request.date().atTime(slot.end()).atZone(zone).toInstant();
        Instant startsAt = notInPast(
                request.mode(), request.date().atTime(slot.start()).atZone(zone).toInstant(), endsAt, clock.instant());

        requireAvailable(resource.requireId(), startsAt, endsAt);
        BookingResponse booking = bookingService.create(
                userId, new CreateBookingRequest(resource.requireId(), BookingType.DESK, startsAt, endsAt, null, null, null));
        return new DeskBookingResponse(
                booking, zone.getId(), request.date(), localTime(startsAt, zone), localTime(endsAt, zone));
    }

    /**
     * The start to book, never before {@code now}. A preset (full or half day) that has begun
     * starts at the next 15-minute mark; a custom slot that has begun is rejected.
     *
     * @throws ApiException BOOKING_IN_PAST
     */
    static Instant notInPast(DeskBookingMode mode, Instant startsAt, Instant endsAt, Instant now) {
        if (!startsAt.isBefore(now)) {
            return startsAt;
        }
        if (!endsAt.isAfter(now)) {
            throw new ApiException(ErrorCode.BOOKING_IN_PAST, "This time has already passed");
        }
        if (mode == DeskBookingMode.CUSTOM) {
            throw new ApiException(ErrorCode.BOOKING_IN_PAST, "The start time has already passed");
        }
        Instant next = nextStep(now);
        if (!next.isBefore(endsAt)) {
            throw new ApiException(ErrorCode.BOOKING_IN_PAST, "Too little of this time is left to book");
        }
        return next;
    }

    /**
     * Keeps bookings within reach; also keeps absurd years away from the database, which cannot
     * store them (a 500 otherwise). The past is left to {@link #notInPast}.
     *
     * @throws ApiException BOOKING_TOO_FAR_AHEAD
     */
    static void requireWithinHorizon(LocalDate date, LocalDate today, int maxDaysAhead) {
        LocalDate last = today.plusDays(maxDaysAhead);
        if (date.isAfter(last)) {
            throw new ApiException(
                    ErrorCode.BOOKING_TOO_FAR_AHEAD,
                    "Desks can be booked at most " + maxDaysAhead + " days ahead, until " + last);
        }
    }

    /**
     * The first 15-minute mark at or after {@code now}. Counted on the UTC epoch, which matches
     * the local clock in every zone whose offset is a multiple of 15 minutes (all current ones).
     */
    static Instant nextStep(Instant now) {
        long step = DeskSlotResolver.STEP_MINUTES * 60L;
        long seconds = now.getEpochSecond() + (now.getNano() > 0 ? 1 : 0);
        return Instant.ofEpochSecond(Math.ceilDiv(seconds, step) * step);
    }

    private void requireAvailable(UUID resourceId, Instant startsAt, Instant endsAt) {
        if (!resourceStatusReader.unavailableAmong(List.of(resourceId)).isEmpty()
                || resourceBlockRepository.existsOverlapping(resourceId, startsAt, endsAt)) {
            throw new ApiException(ErrorCode.RESOURCE_UNAVAILABLE, "This desk is not available at this time");
        }
    }

    private Building buildingOf(Resource resource) {
        var floor = floorRepository
                .findById(resource.getFloorId())
                .orElseThrow(() -> new ApiException(ErrorCode.FLOOR_NOT_FOUND));
        return buildingRepository
                .findById(floor.getBuildingId())
                .orElseThrow(() -> new ApiException(ErrorCode.BUILDING_NOT_FOUND));
    }

    /** A weekday missing from the schedule counts as closed. */
    private static OpeningHours hoursOn(Building building, DayOfWeek day) {
        return building.getOpeningHours().stream()
                .filter(hours -> hours.getDayOfWeek() == day)
                .findFirst()
                .orElseGet(() -> new OpeningHours(day, null, null));
    }

    private static LocalTime localTime(Instant instant, ZoneId zone) {
        return instant.atZone(zone).toLocalTime();
    }
}
