package com.example.template.availability.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.template.availability.dto.AvailabilityStatus;
import com.example.template.availability.dto.BookingSummary;
import com.example.template.availability.dto.ResourceAvailability;
import com.example.template.booking.repository.BookingOverlap;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.booking.repository.ResourceBlockRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.resource.service.ResourceStatusReader;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("AvailabilityService")
class AvailabilityServiceTest {

    private static final UUID FLOOR_ID = UUID.randomUUID();
    private static final UUID ME = UUID.randomUUID();
    private static final UUID COLLEAGUE = UUID.randomUUID();
    private static final Instant FROM = Instant.parse("2026-12-01T08:00:00Z");
    private static final Instant TO = Instant.parse("2026-12-01T18:00:00Z");

    @Mock
    private FloorRepository floorRepository;

    @Mock
    private ResourceRepository resourceRepository;

    @Mock
    private BookingRepository bookingRepository;

    @Mock
    private ResourceBlockRepository resourceBlockRepository;

    @Mock
    private ResourceStatusReader resourceStatusReader;

    private AvailabilityService service;

    @BeforeEach
    void setUp() {
        service = new AvailabilityService(
                floorRepository, resourceRepository, bookingRepository, resourceBlockRepository, resourceStatusReader);
    }

    private static Resource resource(String name, ResourceType type) {
        var resource = new Resource(FLOOR_ID);
        resource.setName(name);
        resource.setType(type);
        ReflectionTestUtils.setField(resource, "id", UUID.randomUUID());
        return resource;
    }

    private static BookingOverlap booking(
            Resource resource, UUID userId, @Nullable String title, @Nullable String first, @Nullable String last) {
        return new BookingOverlap(resource.requireId(), userId, title, FROM, FROM.plusSeconds(3600), first, last);
    }

    private static BookingSummary summary(boolean mine) {
        return new BookingSummary(FROM, TO, null, "Ana Pop", mine);
    }

    private List<ResourceAvailability> availability(
            List<Resource> resources,
            Set<UUID> statusUnavailable,
            List<UUID> blocked,
            List<BookingOverlap> bookings) {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(true);
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(resources);
        when(resourceStatusReader.unavailableAmong(any())).thenReturn(statusUnavailable);
        when(resourceBlockRepository.findBlockedResourceIdsOnFloor(FLOOR_ID, FROM, TO)).thenReturn(blocked);
        when(bookingRepository.findOccupyingOverlappingOnFloor(FLOOR_ID, FROM, TO)).thenReturn(bookings);
        return service.forFloor(FLOOR_ID, FROM, TO, ME).resources();
    }

    // --- status priority ---

    @Test
    @DisplayName("resolves FREE without bookings, BOOKED for a colleague's, BOOKED_BY_ME for the caller's")
    void resolveStatus_bookingsOnly() {
        assertThat(AvailabilityService.resolveStatus(false, List.of())).isEqualTo(AvailabilityStatus.FREE);
        assertThat(AvailabilityService.resolveStatus(false, List.of(summary(false))))
                .isEqualTo(AvailabilityStatus.BOOKED);
        assertThat(AvailabilityService.resolveStatus(false, List.of(summary(true))))
                .isEqualTo(AvailabilityStatus.BOOKED_BY_ME);
    }

    @Test
    @DisplayName("prefers BOOKED_BY_ME over BOOKED when the caller and a colleague both overlap")
    void resolveStatus_mineWinsOverOthers() {
        assertThat(AvailabilityService.resolveStatus(false, List.of(summary(false), summary(true))))
                .isEqualTo(AvailabilityStatus.BOOKED_BY_ME);
    }

    @Test
    @DisplayName("prefers UNAVAILABLE over every booking")
    void resolveStatus_unavailableWins() {
        assertThat(AvailabilityService.resolveStatus(true, List.of())).isEqualTo(AvailabilityStatus.UNAVAILABLE);
        assertThat(AvailabilityService.resolveStatus(true, List.of(summary(true), summary(false))))
                .isEqualTo(AvailabilityStatus.UNAVAILABLE);
    }

    // --- forFloor ---

    @Test
    @DisplayName("combines bookings, admin blocks and resource status per resource, in name order")
    void forFloor_combinesAllSources() {
        var free = resource("A free", ResourceType.DESK);
        var mine = resource("B mine", ResourceType.DESK);
        var theirs = resource("C theirs", ResourceType.PHONE_BOOTH);
        var blocked = resource("D blocked", ResourceType.DESK);
        var maintenance = resource("E maintenance", ResourceType.PARKING_SPOT);

        var result = availability(
                List.of(free, mine, theirs, blocked, maintenance),
                Set.of(maintenance.requireId()),
                List.of(blocked.requireId()),
                List.of(
                        booking(mine, ME, null, "Me", "Myself"),
                        booking(theirs, COLLEAGUE, null, "Ana", "Pop"),
                        booking(blocked, COLLEAGUE, null, "Ana", "Pop")));

        assertThat(result)
                .extracting(ResourceAvailability::name, ResourceAvailability::status)
                .containsExactly(
                        tuple("A free", AvailabilityStatus.FREE),
                        tuple("B mine", AvailabilityStatus.BOOKED_BY_ME),
                        tuple("C theirs", AvailabilityStatus.BOOKED),
                        tuple("D blocked", AvailabilityStatus.UNAVAILABLE),
                        tuple("E maintenance", AvailabilityStatus.UNAVAILABLE));
        assertThat(result.get(3).bookings()).hasSize(1);
    }

    @Test
    @DisplayName("summarises a booking with time, title and the booker's name only")
    void forFloor_summary() {
        var room = resource("Room", ResourceType.DESK);
        var overlap = booking(room, COLLEAGUE, "Sprint review", " Ana ", "Pop");

        var summary = availability(List.of(room), Set.of(), List.of(), List.of(overlap))
                .getFirst()
                .bookings()
                .getFirst();

        assertThat(summary).isEqualTo(new BookingSummary(
                overlap.startsAt(), overlap.endsAt(), "Sprint review", "Ana Pop", false));
    }

    @Test
    @DisplayName("leaves bookedBy empty when the booker has no name, never falling back to the e-mail")
    void forFloor_summaryWithoutName() {
        var desk = resource("Desk", ResourceType.DESK);

        var summary = availability(
                        List.of(desk), Set.of(), List.of(), List.of(booking(desk, COLLEAGUE, null, null, " ")))
                .getFirst()
                .bookings()
                .getFirst();

        assertThat(summary.bookedBy()).isNull();
    }

    @Test
    @DisplayName("marks display-only resources as not bookable")
    void forFloor_bookableFlag() {
        var desk = resource("Desk", ResourceType.DESK);
        var breakRoom = resource("Kitchen", ResourceType.BREAK_ROOM);

        var result = availability(List.of(desk, breakRoom), Set.of(), List.of(), List.of());

        assertThat(result).extracting(ResourceAvailability::bookable).containsExactly(true, false);
    }

    @Test
    @DisplayName("answers an empty list for a floor without resources")
    void forFloor_noResources() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(true);
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of());

        assertThat(service.forFloor(FLOOR_ID, FROM, TO, ME).resources()).isEmpty();
        verifyNoInteractions(bookingRepository, resourceBlockRepository, resourceStatusReader);
    }

    @Test
    @DisplayName("throws FLOOR_NOT_FOUND for an unknown floor")
    void forFloor_unknownFloor() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.forFloor(FLOOR_ID, FROM, TO, ME))
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.FLOOR_NOT_FOUND));
    }

    // --- range validation ---

    @Test
    @DisplayName("rejects a range whose start is not before its end")
    void forFloor_startNotBeforeEnd() {
        assertInvalidRange(TO, FROM);
        assertInvalidRange(FROM, FROM);
        verifyNoInteractions(floorRepository);
    }

    @Test
    @DisplayName("accepts exactly 31 days and rejects anything longer")
    void forFloor_maxRange() {
        Instant limit = FROM.plus(Duration.ofDays(31));
        AvailabilityService.requireValidRange(FROM, limit);

        assertInvalidRange(FROM, limit.plusSeconds(1));
    }

    private void assertInvalidRange(Instant from, Instant to) {
        assertThatThrownBy(() -> service.forFloor(FLOOR_ID, from, to, ME))
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.INVALID_TIME_RANGE));
    }
}
