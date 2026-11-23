package com.example.template.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.booking.dto.DeskBookingMode;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@DisplayName("DeskBookingService")
class DeskBookingServiceTest {

    private static final Instant OPENS = Instant.parse("2026-12-01T08:00:00Z");
    private static final Instant CLOSES = Instant.parse("2026-12-01T18:00:00Z");

    private static void assertInPast(Runnable call) {
        assertThatThrownBy(call::run)
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.BOOKING_IN_PAST);
    }

    @Test
    @DisplayName("keeps a start that has not passed")
    void future() {
        var now = Instant.parse("2026-11-30T12:00:00Z");

        assertThat(DeskBookingService.notInPast(DeskBookingMode.CUSTOM, OPENS, CLOSES, now)).isEqualTo(OPENS);
        assertThat(DeskBookingService.notInPast(DeskBookingMode.CUSTOM, OPENS, CLOSES, OPENS)).isEqualTo(OPENS);
    }

    @Test
    @DisplayName("starts a full day that has begun at the next 15-minute mark")
    void presetBegun() {
        var now = Instant.parse("2026-12-01T10:07:00Z");

        assertThat(DeskBookingService.notInPast(DeskBookingMode.FULL_DAY, OPENS, CLOSES, now))
                .isEqualTo(Instant.parse("2026-12-01T10:15:00Z"));
    }

    @Test
    @DisplayName("rejects a custom slot that has begun")
    void customBegun() {
        assertInPast(() -> DeskBookingService.notInPast(
                DeskBookingMode.CUSTOM, OPENS, CLOSES, Instant.parse("2026-12-01T10:07:00Z")));
    }

    @Test
    @DisplayName("rejects a slot that has ended, whatever the mode")
    void ended() {
        var now = Instant.parse("2026-12-01T18:00:00Z");

        assertInPast(() -> DeskBookingService.notInPast(DeskBookingMode.FULL_DAY, OPENS, CLOSES, now));
        assertInPast(() -> DeskBookingService.notInPast(DeskBookingMode.CUSTOM, OPENS, CLOSES, now));
    }

    @Test
    @DisplayName("rejects a preset with no full 15-minute step left")
    void tooLittleLeft() {
        assertInPast(() -> DeskBookingService.notInPast(
                DeskBookingMode.AFTERNOON, OPENS, CLOSES, Instant.parse("2026-12-01T17:46:00Z")));
    }

    @Test
    @DisplayName("accepts dates up to the horizon, including its last day")
    void withinHorizon() {
        var today = LocalDate.parse("2026-11-23");

        DeskBookingService.requireWithinHorizon(today, today, 90);
        DeskBookingService.requireWithinHorizon(LocalDate.parse("2027-02-21"), today, 90);
    }

    @Test
    @DisplayName("rejects a date after the horizon with BOOKING_TOO_FAR_AHEAD")
    void beyondHorizon() {
        var today = LocalDate.parse("2026-11-23");

        assertThatThrownBy(() -> DeskBookingService.requireWithinHorizon(LocalDate.parse("2027-02-22"), today, 90))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.BOOKING_TOO_FAR_AHEAD);
    }

    @ParameterizedTest
    @CsvSource({
        "2026-12-01T10:00:00Z, 2026-12-01T10:00:00Z",
        "2026-12-01T10:00:00.001Z, 2026-12-01T10:15:00Z",
        "2026-12-01T10:14:59Z, 2026-12-01T10:15:00Z",
        "2026-12-01T23:50:00Z, 2026-12-02T00:00:00Z"
    })
    @DisplayName("rounds up to the next 15-minute mark")
    void nextStep(Instant now, Instant expected) {
        assertThat(DeskBookingService.nextStep(now)).isEqualTo(expected);
    }
}
