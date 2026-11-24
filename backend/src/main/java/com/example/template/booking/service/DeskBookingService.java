package com.example.template.booking.service;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.dto.CreateBookingRequest;
import com.example.template.booking.dto.DeskBookingMode;
import com.example.template.booking.dto.DeskBookingRequest;
import com.example.template.booking.dto.DeskBookingResponse;
import com.example.template.booking.dto.DeskBookingSettings;
import com.example.template.booking.repository.ResourceBlockRepository;
import com.example.template.booking.service.DeskSlotResolver.LocalSlot;
import com.example.template.building.dto.BuildingSchedule;
import com.example.template.building.dto.OpeningHoursDto;
import com.example.template.building.service.BuildingScheduleService;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.resource.service.ResourceStatusReader;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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
    private final BuildingScheduleService buildingScheduleService;
    private final ResourceBlockRepository resourceBlockRepository;
    private final ResourceStatusReader resourceStatusReader;
    private final BookingService bookingService;
    private final DeskBookingProperties properties;
    private final Clock clock;

    public DeskBookingService(
            ResourceRepository resourceRepository,
            BuildingScheduleService buildingScheduleService,
            ResourceBlockRepository resourceBlockRepository,
            ResourceStatusReader resourceStatusReader,
            BookingService bookingService,
            DeskBookingProperties properties,
            Clock clock) {
        this.resourceRepository = resourceRepository;
        this.buildingScheduleService = buildingScheduleService;
        this.resourceBlockRepository = resourceBlockRepository;
        this.resourceStatusReader = resourceStatusReader;
        this.bookingService = bookingService;
        this.properties = properties;
        this.clock = clock;
    }

    public DeskBookingSettings settings() {
        return new DeskBookingSettings(
                properties.halfDaySplit(), properties.maxDaysAhead(), DeskSlotResolver.STEP_MINUTES);
    }

    /**
     * Books the desk for {@code userId} as CONFIRMED.
     *
     * @throws ApiException RESOURCE_NOT_FOUND; RESOURCE_NOT_BOOKABLE for display-only resources and
     *     meeting rooms (they have their own flow); BOOKING_TOO_FAR_AHEAD;
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
        if (resource.getType() == ResourceType.MEETING_ROOM) {
            throw new ApiException(
                    ErrorCode.RESOURCE_NOT_BOOKABLE, "A meeting room is booked through the meeting room flow");
        }
        BuildingSchedule schedule = buildingScheduleService.forFloor(resource.getFloorId());
        ZoneId zone = schedule.zone();
        requireWithinHorizon(request.date(), LocalDate.now(clock.withZone(zone)), properties.maxDaysAhead());

        OpeningHoursDto hours = schedule.hoursOn(request.date().getDayOfWeek());
        LocalSlot slot = DeskSlotResolver.resolve(
                request.mode(),
                hours.opensAt(),
                hours.closesAt(),
                properties.halfDaySplit(),
                request.startTime(),
                request.endTime());
        boolean picked = request.mode() == DeskBookingMode.CUSTOM;
        Instant endsAt = toInstant(request.date(), slot.end(), zone, picked);
        Instant startsAt =
                notInPast(request.mode(), toInstant(request.date(), slot.start(), zone, picked), endsAt, clock.instant());

        requireAvailable(resource, startsAt, endsAt);
        BookingResponse booking = bookingService.create(
                userId, new CreateBookingRequest(resource.requireId(), BookingType.DESK, startsAt, endsAt, null, null, null));
        return new DeskBookingResponse(
                booking, zone.getId(), request.date(), localTime(startsAt, zone), localTime(endsAt, zone));
    }

    /**
     * The instant of a wall-clock time in the building's zone. Clock changes:
     *
     * <ul>
     *   <li>A time skipped when the clocks go forward does not exist. If the user picked it
     *       ({@code strict}), it is rejected; a time from the opening hours moves forward by the
     *       length of the gap, as {@link java.time.ZonedDateTime} does.
     *   <li>A time repeated when the clocks go back takes its earlier occurrence.
     * </ul>
     *
     * @throws ApiException VALIDATION_FAILED for a picked time that does not exist on that date
     */
    static Instant toInstant(LocalDate date, LocalTime time, ZoneId zone, boolean strict) {
        LocalDateTime local = date.atTime(time);
        ZonedDateTime zoned = local.atZone(zone);
        if (strict && !zoned.toLocalDateTime().equals(local)) {
            throw new ApiException(
                    ErrorCode.VALIDATION_FAILED,
                    time + " does not exist on " + date + " in " + zone + " because the clocks go forward");
        }
        return zoned.toInstant();
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
                    "Bookings can be made at most " + maxDaysAhead + " days ahead, until " + last);
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

    private void requireAvailable(Resource resource, Instant startsAt, Instant endsAt) {
        UUID id = resource.requireId();
        if (!resourceStatusReader.unavailableAmong(List.of(id)).isEmpty()
                || resourceBlockRepository.existsOverlapping(id, startsAt, endsAt)) {
            throw new ApiException(
                    ErrorCode.RESOURCE_UNAVAILABLE,
                    "This " + resource.getType().noun() + " is not available at this time");
        }
    }

    private static LocalTime localTime(Instant instant, ZoneId zone) {
        return instant.atZone(zone).toLocalTime();
    }
}
