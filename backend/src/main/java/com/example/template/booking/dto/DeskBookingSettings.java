package com.example.template.booking.dto;

import java.time.LocalTime;

/**
 * The desk booking settings the booking form needs to preview what the server will book, so the
 * client never hard-codes them.
 *
 * @param halfDaySplit where the morning ends and the afternoon starts, in the building's time zone
 * @param maxDaysAhead how many days after today (in the building's time zone) can be booked
 * @param stepMinutes the grid of custom start and end times
 */
public record DeskBookingSettings(LocalTime halfDaySplit, int maxDaysAhead, int stepMinutes) {}
