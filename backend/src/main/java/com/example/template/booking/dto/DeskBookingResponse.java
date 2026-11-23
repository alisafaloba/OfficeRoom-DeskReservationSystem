package com.example.template.booking.dto;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * The stored desk booking plus its times in the building's time zone, so the confirmation shows
 * them the way the user picked them.
 *
 * @param timeZone the building's IANA zone id, e.g. {@code Europe/Bucharest}
 * @param startTime the local start; later than the picked one when a full or half day for today
 *     had already begun (see {@code DeskBookingService})
 */
public record DeskBookingResponse(
        BookingResponse booking, String timeZone, LocalDate date, LocalTime startTime, LocalTime endTime) {}
