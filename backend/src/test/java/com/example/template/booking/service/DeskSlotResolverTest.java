package com.example.template.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.booking.dto.DeskBookingMode;
import com.example.template.booking.service.DeskSlotResolver.LocalSlot;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.LocalTime;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

@DisplayName("DeskSlotResolver")
class DeskSlotResolverTest {

    private static final LocalTime OPENS = LocalTime.of(8, 0);
    private static final LocalTime CLOSES = LocalTime.of(18, 0);
    private static final LocalTime SPLIT = LocalTime.of(13, 0);

    private static LocalSlot resolve(DeskBookingMode mode) {
        return DeskSlotResolver.resolve(mode, OPENS, CLOSES, SPLIT, null, null);
    }

    private static LocalSlot custom(@Nullable String start, @Nullable String end) {
        return DeskSlotResolver.resolve(
                DeskBookingMode.CUSTOM,
                OPENS,
                CLOSES,
                SPLIT,
                start == null ? null : LocalTime.parse(start),
                end == null ? null : LocalTime.parse(end));
    }

    private static void assertCode(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run)
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(code);
    }

    @Test
    @DisplayName("a full day runs from opening to closing time")
    void fullDay() {
        assertThat(resolve(DeskBookingMode.FULL_DAY)).isEqualTo(new LocalSlot(OPENS, CLOSES));
    }

    @Test
    @DisplayName("the morning ends and the afternoon starts at the half-day split")
    void halfDays() {
        assertThat(resolve(DeskBookingMode.MORNING)).isEqualTo(new LocalSlot(OPENS, SPLIT));
        assertThat(resolve(DeskBookingMode.AFTERNOON)).isEqualTo(new LocalSlot(SPLIT, CLOSES));
    }

    @Test
    @DisplayName("uses the configured split instead of 13:00")
    void configuredSplit() {
        var split = LocalTime.of(12, 30);
        assertThat(DeskSlotResolver.resolve(DeskBookingMode.MORNING, OPENS, CLOSES, split, null, null))
                .isEqualTo(new LocalSlot(OPENS, split));
    }

    @ParameterizedTest
    @EnumSource(DeskBookingMode.class)
    @DisplayName("rejects every mode on a day the building is closed")
    void closedDay(DeskBookingMode mode) {
        LocalTime start = mode == DeskBookingMode.CUSTOM ? LocalTime.of(9, 0) : null;
        LocalTime end = mode == DeskBookingMode.CUSTOM ? LocalTime.of(10, 0) : null;
        assertCode(() -> DeskSlotResolver.resolve(mode, null, null, SPLIT, start, end), ErrorCode.OUTSIDE_OPENING_HOURS);
    }

    @Test
    @DisplayName("has no morning when the building opens after the split")
    void noMorning() {
        assertCode(
                () -> DeskSlotResolver.resolve(
                        DeskBookingMode.MORNING, LocalTime.of(13, 0), CLOSES, SPLIT, null, null),
                ErrorCode.OUTSIDE_OPENING_HOURS);
    }

    @Test
    @DisplayName("has no afternoon when the building closes at the split")
    void noAfternoon() {
        assertCode(
                () -> DeskSlotResolver.resolve(
                        DeskBookingMode.AFTERNOON, OPENS, LocalTime.of(13, 0), SPLIT, null, null),
                ErrorCode.OUTSIDE_OPENING_HOURS);
    }

    @Test
    @DisplayName("accepts a custom slot on the 15-minute grid, including the opening edges")
    void customInside() {
        assertThat(custom("09:15", "11:45")).isEqualTo(new LocalSlot(LocalTime.of(9, 15), LocalTime.of(11, 45)));
        assertThat(custom("08:00", "18:00")).isEqualTo(new LocalSlot(OPENS, CLOSES));
    }

    @ParameterizedTest
    @CsvSource({"07:45,09:00", "17:00,18:15", "06:00,19:00"})
    @DisplayName("rejects a custom slot that leaves the opening hours")
    void customOutside(String start, String end) {
        assertCode(() -> custom(start, end), ErrorCode.OUTSIDE_OPENING_HOURS);
    }

    @ParameterizedTest
    @CsvSource({"10:00,10:00", "11:00,10:00"})
    @DisplayName("rejects a custom slot whose start is not before its end")
    void customBackwards(String start, String end) {
        assertCode(() -> custom(start, end), ErrorCode.INVALID_TIME_RANGE);
    }

    @ParameterizedTest
    @CsvSource({"09:10,10:00", "09:00,10:20", "09:00:30,10:00"})
    @DisplayName("rejects custom times off the 15-minute grid")
    void customOffGrid(String start, String end) {
        assertCode(() -> custom(start, end), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    @DisplayName("requires both times for a custom booking")
    void customMissingTimes() {
        assertCode(() -> custom("09:00", null), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> custom(null, "10:00"), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    @DisplayName("rejects times sent with a preset mode")
    void timesWithPreset() {
        assertCode(
                () -> DeskSlotResolver.resolve(
                        DeskBookingMode.FULL_DAY, OPENS, CLOSES, SPLIT, LocalTime.of(9, 0), null),
                ErrorCode.VALIDATION_FAILED);
    }
}
