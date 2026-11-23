package com.example.template.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.mapper.BookingMapper;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Instant;
import java.util.Optional;
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
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("BookingService")
class BookingServiceTest {

    private static final UUID BOOKING_ID = UUID.randomUUID();

    @Mock
    private BookingRepository bookingRepository;

    private BookingService service;

    @BeforeEach
    void setUp() {
        service = new BookingService(bookingRepository, new BookingMapper());
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
}
