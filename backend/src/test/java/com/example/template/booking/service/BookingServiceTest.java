package com.example.template.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.dto.CreateBookingRequest;
import com.example.template.booking.dto.MoveBookingRequest;
import com.example.template.booking.mapper.BookingMapper;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import com.example.template.user.repository.UserRepository;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("BookingService")
class BookingServiceTest {

    private static final UUID BOOKING_ID = UUID.randomUUID();

    @Mock
    private BookingRepository bookingRepository;

    @Mock
    private ResourceRepository resourceRepository;

    @Mock
    private UserRepository userRepository;

    private BookingService service;

    @BeforeEach
    void setUp() {
        service = new BookingService(bookingRepository, resourceRepository, userRepository, new BookingMapper());
    }

    private Booking stored(BookingStatus status) {
        var booking = new Booking(
                UUID.randomUUID(),
                UUID.randomUUID(),
                BookingType.DESK,
                Instant.parse("2026-12-01T09:00:00Z"),
                Instant.parse("2026-12-01T17:00:00Z"));
        booking.setStatus(status);
        ReflectionTestUtils.setField(booking, "id", BOOKING_ID);
        ReflectionTestUtils.setField(booking, "createdAt", Instant.parse("2026-11-21T00:00:00Z"));
        ReflectionTestUtils.setField(booking, "updatedAt", Instant.parse("2026-11-21T00:00:00Z"));
        when(bookingRepository.findById(BOOKING_ID)).thenReturn(Optional.of(booking));
        return booking;
    }

    private void savesReturnTheEntity() {
        when(bookingRepository.saveAndFlush(any(Booking.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    /** Each service method with the status it moves to. */
    static Stream<Arguments> actions() {
        return Stream.of(
                Arguments.of("checkIn", BookingStatus.CHECKED_IN),
                Arguments.of("complete", BookingStatus.COMPLETED),
                Arguments.of("cancel", BookingStatus.CANCELLED),
                Arguments.of("markNoShow", BookingStatus.NO_SHOW));
    }

    private Function<UUID, BookingResponse> action(String name) {
        return switch (name) {
            case "checkIn" -> service::checkIn;
            case "complete" -> service::complete;
            case "cancel" -> id -> service.cancel(id, null);
            case "markNoShow" -> service::markNoShow;
            default -> throw new IllegalArgumentException(name);
        };
    }

    @Test
    @DisplayName("walks the happy path CONFIRMED → CHECKED_IN → COMPLETED")
    void checkInThenComplete() {
        var booking = stored(BookingStatus.CONFIRMED);
        savesReturnTheEntity();

        assertThat(service.checkIn(BOOKING_ID).status()).isEqualTo(BookingStatus.CHECKED_IN);
        assertThat(service.complete(BOOKING_ID).status()).isEqualTo(BookingStatus.COMPLETED);
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.COMPLETED);
    }

    @Test
    @DisplayName("cancels a confirmed booking and keeps the stripped reason")
    void cancel_keepsReason() {
        stored(BookingStatus.CONFIRMED);
        savesReturnTheEntity();

        var response = service.cancel(BOOKING_ID, "  Room needed for an audit  ");

        assertThat(response.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(response.cancelReason()).isEqualTo("Room needed for an audit");
    }

    @Test
    @DisplayName("stores no reason when the cancel reason is blank")
    void cancel_blankReason() {
        stored(BookingStatus.CONFIRMED);
        savesReturnTheEntity();

        assertThat(service.cancel(BOOKING_ID, "   ").cancelReason()).isNull();
    }

    @Test
    @DisplayName("marks a confirmed booking as no-show")
    void markNoShow() {
        stored(BookingStatus.CONFIRMED);
        savesReturnTheEntity();

        assertThat(service.markNoShow(BOOKING_ID).status()).isEqualTo(BookingStatus.NO_SHOW);
    }

    @ParameterizedTest(name = "{0} from {2}")
    @MethodSource("invalidTransitions")
    @DisplayName("rejects every change the lifecycle does not allow and leaves the booking untouched")
    void invalidTransition_isRejected(String actionName, BookingStatus target, BookingStatus from) {
        var booking = stored(from);

        assertThatThrownBy(() -> action(actionName).apply(BOOKING_ID))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.INVALID_BOOKING_STATUS_TRANSITION));
        assertThat(booking.getStatus()).isEqualTo(from);
        verify(bookingRepository, never()).saveAndFlush(any());
    }

    static Stream<Arguments> invalidTransitions() {
        return actions().flatMap(action -> Stream.of(BookingStatus.values())
                .filter(from -> !from.canTransitionTo((BookingStatus) action.get()[1]))
                .map(from -> Arguments.of(action.get()[0], action.get()[1], from)));
    }

    @Test
    @DisplayName("rejects CANCELLED → CHECKED_IN with 409")
    void checkIn_cancelled_isRejected() {
        stored(BookingStatus.CANCELLED);

        assertThatThrownBy(() -> service.checkIn(BOOKING_ID))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.errorCode()).isEqualTo(ErrorCode.INVALID_BOOKING_STATUS_TRANSITION);
                    assertThat(e.errorCode().status().value()).isEqualTo(409);
                    assertThat(e.getMessage()).isEqualTo("A CANCELLED booking cannot become CHECKED_IN");
                });
    }

    @Test
    @DisplayName("throws BOOKING_NOT_FOUND for an unknown booking")
    void unknownBooking() {
        when(bookingRepository.findById(BOOKING_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(BOOKING_ID))
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.BOOKING_NOT_FOUND));
    }

    @Test
    @DisplayName("maps every field, with attendees sorted")
    void getById_mapsFields() {
        var booking = stored(BookingStatus.CONFIRMED);
        booking.setType(BookingType.MEETING_ROOM);
        booking.setTitle("Planning");
        UUID first = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID second = UUID.fromString("00000000-0000-0000-0000-000000000002");
        booking.getAttendeeIds().add(second);
        booking.getAttendeeIds().add(first);

        var response = service.getById(BOOKING_ID);

        assertThat(response.id()).isEqualTo(BOOKING_ID);
        assertThat(response.type()).isEqualTo(BookingType.MEETING_ROOM);
        assertThat(response.title()).isEqualTo("Planning");
        assertThat(response.attendeeIds()).containsExactly(first, second);
        assertThat(response.startsAt()).isEqualTo(booking.getStartsAt());
    }

    // --- create (E5.T2) ---

    private static final UUID RESOURCE_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();
    private static final Instant TEN = Instant.parse("2026-12-01T10:00:00Z");
    private static final Instant ELEVEN = Instant.parse("2026-12-01T11:00:00Z");

    private static CreateBookingRequest request(Instant startsAt, Instant endsAt) {
        return new CreateBookingRequest(RESOURCE_ID, BookingType.DESK, startsAt, endsAt, null, null, null);
    }

    private void resourceOfType(ResourceType type) {
        var resource = new Resource(UUID.randomUUID());
        resource.setName("Desk");
        resource.setType(type);
        when(resourceRepository.findById(RESOURCE_ID)).thenReturn(Optional.of(resource));
    }

    private void noOverlap() {
        when(bookingRepository.findOccupyingOverlappingForResource(RESOURCE_ID, TEN, ELEVEN)).thenReturn(List.of());
    }

    private void savesWithIdAndTimestamps() {
        when(bookingRepository.saveAndFlush(any(Booking.class))).thenAnswer(invocation -> {
            Booking b = invocation.getArgument(0);
            ReflectionTestUtils.setField(b, "id", UUID.randomUUID());
            ReflectionTestUtils.setField(b, "createdAt", Instant.now());
            ReflectionTestUtils.setField(b, "updatedAt", Instant.now());
            return b;
        });
    }

    private static DataIntegrityViolationException integrityViolation(String sqlState, String message) {
        return new DataIntegrityViolationException("could not execute statement", new SQLException(message, sqlState));
    }

    private static void assertCode(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.errorCode()).isEqualTo(code));
    }

    @Test
    @DisplayName("creates a CONFIRMED booking with meeting details for a free slot")
    void create_freeSlot() {
        resourceOfType(ResourceType.DESK);
        noOverlap();
        savesWithIdAndTimestamps();
        UUID attendee = UUID.randomUUID();
        when(userRepository.countByIdIn(Set.of(attendee))).thenReturn(1L);

        var response = service.create(
                USER_ID,
                new CreateBookingRequest(
                        RESOURCE_ID,
                        BookingType.MEETING_ROOM,
                        TEN,
                        ELEVEN,
                        " Planning ",
                        "  ",
                        List.of(attendee, attendee)));

        assertThat(response.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(response.userId()).isEqualTo(USER_ID);
        assertThat(response.title()).isEqualTo("Planning");
        assertThat(response.description()).isNull();
        assertThat(response.attendeeIds()).containsExactly(attendee);
    }

    @Test
    @DisplayName("rejects a title, a description or attendees on a DESK booking with VALIDATION_FAILED")
    void create_deskWithMeetingDetails() {
        UUID attendee = UUID.randomUUID();
        Stream.of(
                        new CreateBookingRequest(RESOURCE_ID, BookingType.DESK, TEN, ELEVEN, "Focus", null, null),
                        new CreateBookingRequest(RESOURCE_ID, BookingType.DESK, TEN, ELEVEN, null, "Notes", null),
                        new CreateBookingRequest(
                                RESOURCE_ID, BookingType.DESK, TEN, ELEVEN, null, null, List.of(attendee)))
                .forEach(request ->
                        assertCode(() -> service.create(USER_ID, request), ErrorCode.VALIDATION_FAILED));
        verify(bookingRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("books a DESK whose title and description are only blanks")
    void create_deskWithBlankDetails() {
        resourceOfType(ResourceType.DESK);
        noOverlap();
        savesWithIdAndTimestamps();

        var response = service.create(
                USER_ID, new CreateBookingRequest(RESOURCE_ID, BookingType.DESK, TEN, ELEVEN, " ", "", List.of()));

        assertThat(response.title()).isNull();
        assertThat(response.description()).isNull();
    }

    @Test
    @DisplayName("rejects an unknown attendee with ATTENDEE_NOT_FOUND before locking or saving")
    void create_unknownAttendee() {
        resourceOfType(ResourceType.DESK);
        UUID known = UUID.randomUUID();
        UUID unknown = UUID.randomUUID();
        when(userRepository.countByIdIn(Set.of(known, unknown))).thenReturn(1L);
        var request = new CreateBookingRequest(
                RESOURCE_ID, BookingType.MEETING_ROOM, TEN, ELEVEN, "Planning", null, List.of(known, unknown));

        assertCode(() -> service.create(USER_ID, request), ErrorCode.ATTENDEE_NOT_FOUND);
        verify(bookingRepository, never()).lockResourceForWriting(any());
        verify(bookingRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("locks the resource before the overlap pre-check and the insert")
    void create_locksBeforeChecking() {
        resourceOfType(ResourceType.DESK);
        noOverlap();
        savesWithIdAndTimestamps();

        service.create(USER_ID, request(TEN, ELEVEN));

        var order = inOrder(bookingRepository);
        order.verify(bookingRepository).lockResourceForWriting(RESOURCE_ID);
        order.verify(bookingRepository).findOccupyingOverlappingForResource(RESOURCE_ID, TEN, ELEVEN);
        order.verify(bookingRepository).saveAndFlush(any(Booking.class));
    }

    @Test
    @DisplayName("rejects an overlapping slot in the pre-check with BOOKING_CONFLICT naming the taken slot")
    void create_preCheckConflict() {
        resourceOfType(ResourceType.DESK);
        var existing = new Booking(RESOURCE_ID, UUID.randomUUID(), BookingType.DESK, TEN, ELEVEN);
        ReflectionTestUtils.setField(existing, "id", UUID.randomUUID());
        when(bookingRepository.findOccupyingOverlappingForResource(RESOURCE_ID, TEN, ELEVEN))
                .thenReturn(List.of(existing));

        assertThatThrownBy(() -> service.create(USER_ID, request(TEN, ELEVEN)))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.errorCode()).isEqualTo(ErrorCode.BOOKING_CONFLICT);
                    assertThat(e.getMessage()).contains("2026-12-01T10:00:00Z").contains("2026-12-01T11:00:00Z");
                });
        verify(bookingRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("turns the database exclusion violation of a lost race into BOOKING_CONFLICT")
    void create_raceLostAtDatabase() {
        resourceOfType(ResourceType.DESK);
        noOverlap();
        when(bookingRepository.saveAndFlush(any(Booking.class)))
                .thenThrow(integrityViolation(
                        "23P01", "ERROR: conflicting key value violates exclusion constraint \"ex_bookings_no_overlap\""));

        assertCode(() -> service.create(USER_ID, request(TEN, ELEVEN)), ErrorCode.BOOKING_CONFLICT);
    }

    @Test
    @DisplayName("lets any other integrity violation through unchanged")
    void create_otherIntegrityViolation() {
        resourceOfType(ResourceType.DESK);
        noOverlap();
        var violation = integrityViolation("23503", "violates foreign key constraint \"fk_bookings_user\"");
        when(bookingRepository.saveAndFlush(any(Booking.class))).thenThrow(violation);

        assertThatThrownBy(() -> service.create(USER_ID, request(TEN, ELEVEN))).isSameAs(violation);
    }

    @Test
    @DisplayName("rejects a range whose start is not before its end before touching the database")
    void create_invalidRange() {
        assertCode(() -> service.create(USER_ID, request(ELEVEN, TEN)), ErrorCode.INVALID_TIME_RANGE);
        assertCode(() -> service.create(USER_ID, request(TEN, TEN)), ErrorCode.INVALID_TIME_RANGE);
        verify(resourceRepository, never()).findById(any());
    }

    @Test
    @DisplayName("rejects an unknown resource and a display-only one")
    void create_unknownOrNotBookableResource() {
        when(resourceRepository.findById(RESOURCE_ID)).thenReturn(Optional.empty());
        assertCode(() -> service.create(USER_ID, request(TEN, ELEVEN)), ErrorCode.RESOURCE_NOT_FOUND);

        resourceOfType(ResourceType.BREAK_ROOM);
        assertCode(() -> service.create(USER_ID, request(TEN, ELEVEN)), ErrorCode.RESOURCE_NOT_BOOKABLE);
        verify(bookingRepository, never()).findOccupyingOverlappingForResource(eq(RESOURCE_ID), any(), any());
    }

    // --- move (E5.T2) ---

    private static final Instant NOON = Instant.parse("2026-12-01T12:00:00Z");

    @Test
    @DisplayName("moves a confirmed booking over part of its own old slot")
    void move_overlappingItsOwnSlot() {
        var booking = stored(BookingStatus.CONFIRMED);
        UUID resourceId = booking.getResourceId();
        Instant newStart = booking.getStartsAt().plusSeconds(1800);
        Instant newEnd = booking.getEndsAt().plusSeconds(1800);
        when(bookingRepository.findOccupyingOverlappingForResource(resourceId, newStart, newEnd))
                .thenReturn(List.of(booking));
        savesReturnTheEntity();

        var response = service.move(BOOKING_ID, new MoveBookingRequest(resourceId, newStart, newEnd));

        assertThat(response.startsAt()).isEqualTo(newStart);
        assertThat(response.endsAt()).isEqualTo(newEnd);
        verify(resourceRepository, never()).findById(any());
    }

    @Test
    @DisplayName("locks the target resource before checking a move")
    void move_locksTargetResource() {
        var booking = stored(BookingStatus.CONFIRMED);
        resourceOfType(ResourceType.DESK);
        when(bookingRepository.findOccupyingOverlappingForResource(RESOURCE_ID, TEN, ELEVEN)).thenReturn(List.of());
        savesReturnTheEntity();

        service.move(BOOKING_ID, new MoveBookingRequest(RESOURCE_ID, TEN, ELEVEN));

        var order = inOrder(bookingRepository);
        order.verify(bookingRepository).lockResourceForWriting(RESOURCE_ID);
        order.verify(bookingRepository).findOccupyingOverlappingForResource(RESOURCE_ID, TEN, ELEVEN);
        assertThat(booking.getResourceId()).isEqualTo(RESOURCE_ID);
    }

    @Test
    @DisplayName("rejects moving onto another booking's slot with BOOKING_CONFLICT and changes nothing")
    void move_ontoOccupiedSlot() {
        var booking = stored(BookingStatus.CONFIRMED);
        Instant originalStart = booking.getStartsAt();
        var other = new Booking(RESOURCE_ID, UUID.randomUUID(), BookingType.DESK, TEN, NOON);
        ReflectionTestUtils.setField(other, "id", UUID.randomUUID());
        resourceOfType(ResourceType.DESK);
        when(bookingRepository.findOccupyingOverlappingForResource(RESOURCE_ID, TEN, ELEVEN))
                .thenReturn(List.of(other));

        assertCode(() -> service.move(BOOKING_ID, new MoveBookingRequest(RESOURCE_ID, TEN, ELEVEN)),
                ErrorCode.BOOKING_CONFLICT);
        assertThat(booking.getStartsAt()).isEqualTo(originalStart);
        verify(bookingRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("turns a lost race while moving into BOOKING_CONFLICT")
    void move_raceLostAtDatabase() {
        var booking = stored(BookingStatus.CONFIRMED);
        when(bookingRepository.findOccupyingOverlappingForResource(booking.getResourceId(), TEN, ELEVEN))
                .thenReturn(List.of());
        when(bookingRepository.saveAndFlush(any(Booking.class)))
                .thenThrow(integrityViolation(
                        "23P01", "ERROR: conflicting key value violates exclusion constraint \"ex_bookings_no_overlap\""));

        assertCode(() -> service.move(BOOKING_ID, new MoveBookingRequest(booking.getResourceId(), TEN, ELEVEN)),
                ErrorCode.BOOKING_CONFLICT);
    }

    @Test
    @DisplayName("moves only confirmed bookings")
    void move_notConfirmed() {
        stored(BookingStatus.CHECKED_IN);

        assertCode(() -> service.move(BOOKING_ID, new MoveBookingRequest(RESOURCE_ID, TEN, ELEVEN)),
                ErrorCode.BOOKING_NOT_MOVABLE);
    }

    @Test
    @DisplayName("rejects moving to a display-only resource")
    void move_toNotBookableResource() {
        stored(BookingStatus.CONFIRMED);
        resourceOfType(ResourceType.BREAK_ROOM);

        assertCode(() -> service.move(BOOKING_ID, new MoveBookingRequest(RESOURCE_ID, TEN, ELEVEN)),
                ErrorCode.RESOURCE_NOT_BOOKABLE);
    }
}
