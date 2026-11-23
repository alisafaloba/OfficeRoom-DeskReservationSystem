package com.example.template.booking.dto;

import static com.example.template.booking.dto.BookingStatus.CANCELLED;
import static com.example.template.booking.dto.BookingStatus.CHECKED_IN;
import static com.example.template.booking.dto.BookingStatus.COMPLETED;
import static com.example.template.booking.dto.BookingStatus.CONFIRMED;
import static com.example.template.booking.dto.BookingStatus.NO_SHOW;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

@DisplayName("BookingStatus lifecycle")
class BookingStatusTest {

    /** The whole lifecycle; every pair not listed here must be rejected. */
    private static final Set<String> ALLOWED = Set.of(
            "CONFIRMED->CHECKED_IN",
            "CONFIRMED->CANCELLED",
            "CONFIRMED->NO_SHOW",
            "CHECKED_IN->COMPLETED");

    static Stream<Arguments> everyPair() {
        return EnumSet.allOf(BookingStatus.class).stream()
                .flatMap(from -> EnumSet.allOf(BookingStatus.class).stream().map(to -> Arguments.of(from, to)));
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @MethodSource("everyPair")
    @DisplayName("allows exactly CONFIRMED → CHECKED_IN → COMPLETED and CONFIRMED → CANCELLED | NO_SHOW")
    void canTransitionTo_matchesLifecycle(BookingStatus from, BookingStatus to) {
        assertThat(from.canTransitionTo(to)).isEqualTo(ALLOWED.contains(from + "->" + to));
    }

    @Test
    @DisplayName("rejects CANCELLED → CHECKED_IN and never stays in place")
    void canTransitionTo_examples() {
        assertThat(CANCELLED.canTransitionTo(CHECKED_IN)).isFalse();
        assertThat(CONFIRMED.canTransitionTo(CONFIRMED)).isFalse();
    }

    @Test
    @DisplayName("treats COMPLETED, CANCELLED and NO_SHOW as final")
    void isFinal() {
        assertThat(EnumSet.allOf(BookingStatus.class).stream().filter(BookingStatus::isFinal))
                .containsExactlyInAnyOrder(COMPLETED, CANCELLED, NO_SHOW);
    }

    @Test
    @DisplayName("lets confirmed, checked-in and completed bookings hold the resource")
    void occupying() {
        assertThat(BookingStatus.OCCUPYING).containsExactlyInAnyOrder(CONFIRMED, CHECKED_IN, COMPLETED);
    }
}
