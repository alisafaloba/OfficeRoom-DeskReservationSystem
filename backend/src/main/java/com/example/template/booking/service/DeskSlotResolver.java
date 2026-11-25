package com.example.template.booking.service;

import com.example.template.booking.dto.DeskBookingMode;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.LocalTime;
import org.jspecify.annotations.Nullable;

/**
 * Turns a desk booking mode into start and end times of one day, in the building's local time
 * (E5.T3). Pure: no clock, no time zone, no database; the caller adds the date and the zone.
 */
final class DeskSlotResolver {

    /** Custom times must sit on this grid. */
    static final int STEP_MINUTES = 15;

    private DeskSlotResolver() {}

    /** A start and end time of one day, start before end. */
    record LocalSlot(LocalTime start, LocalTime end) {}

    /**
     * @param opensAt the building's opening time that day, {@code null} if it is closed
     * @param closesAt the building's closing time that day, {@code null} if it is closed
     * @param customStart required for CUSTOM, must be absent otherwise
     * @param customEnd required for CUSTOM, must be absent otherwise
     * @throws ApiException OUTSIDE_OPENING_HOURS if the building is closed that day, the half day
     *     does not exist, or the custom slot leaves the opening hours; VALIDATION_FAILED for
     *     missing, superfluous or off-grid custom times; INVALID_TIME_RANGE if the custom start is
     *     not before its end
     */
    static LocalSlot resolve(
            DeskBookingMode mode,
            @Nullable LocalTime opensAt,
            @Nullable LocalTime closesAt,
            LocalTime halfDaySplit,
            @Nullable LocalTime customStart,
            @Nullable LocalTime customEnd) {
        if (mode != DeskBookingMode.CUSTOM && (customStart != null || customEnd != null)) {
            throw new ApiException(
                    ErrorCode.VALIDATION_FAILED, "Start and end times are only allowed for a custom booking");
        }
        if (mode == DeskBookingMode.CUSTOM) {
            requireCustomTimes(customStart, customEnd);
        }
        if (opensAt == null || closesAt == null) {
            throw new ApiException(ErrorCode.OUTSIDE_OPENING_HOURS, "The building is closed on this day");
        }
        return switch (mode) {
            case FULL_DAY -> new LocalSlot(opensAt, closesAt);
            case MORNING -> {
                requireSplitInside(opensAt, closesAt, halfDaySplit, "morning");
                yield new LocalSlot(opensAt, halfDaySplit);
            }
            case AFTERNOON -> {
                requireSplitInside(opensAt, closesAt, halfDaySplit, "afternoon");
                yield new LocalSlot(halfDaySplit, closesAt);
            }
            case CUSTOM -> customInside(opensAt, closesAt, customStart, customEnd);
        };
    }

    private static void requireCustomTimes(@Nullable LocalTime start, @Nullable LocalTime end) {
        if (start == null || end == null) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "A custom booking needs a start and an end time");
        }
        if (!onGrid(start) || !onGrid(end)) {
            throw new ApiException(
                    ErrorCode.VALIDATION_FAILED, "Custom times must be in steps of " + STEP_MINUTES + " minutes");
        }
        if (!start.isBefore(end)) {
            throw new ApiException(ErrorCode.INVALID_TIME_RANGE, "The start time must be before the end time");
        }
    }

    private static LocalSlot customInside(
            LocalTime opensAt, LocalTime closesAt, @Nullable LocalTime start, @Nullable LocalTime end) {
        // requireCustomTimes already rejected null times; this keeps the null checker satisfied.
        if (start == null || end == null || start.isBefore(opensAt) || end.isAfter(closesAt)) {
            throw new ApiException(
                    ErrorCode.OUTSIDE_OPENING_HOURS,
                    "The building is open from " + opensAt + " to " + closesAt + " on this day");
        }
        return new LocalSlot(start, end);
    }

    /** A half day exists only when the split falls strictly inside the opening hours. */
    private static void requireSplitInside(LocalTime opensAt, LocalTime closesAt, LocalTime split, String half) {
        if (!opensAt.isBefore(split) || !split.isBefore(closesAt)) {
            throw new ApiException(
                    ErrorCode.OUTSIDE_OPENING_HOURS,
                    "There is no " + half + " on this day: the building is open from " + opensAt + " to "
                            + closesAt);
        }
    }

    private static boolean onGrid(LocalTime time) {
        return time.getMinute() % STEP_MINUTES == 0 && time.getSecond() == 0 && time.getNano() == 0;
    }
}
