package com.example.template.availability.dto;

/**
 * How a resource is coloured on the floor plan for a time range. When several apply, the first
 * one listed wins: UNAVAILABLE > BOOKED_BY_ME > BOOKED > FREE.
 */
public enum AvailabilityStatus {

    /** Out of service (E2.T4 status) or blocked by an admin (E8.T4) during the range. */
    UNAVAILABLE,

    /** The caller holds at least one active booking that overlaps the range. */
    BOOKED_BY_ME,

    /** Someone else holds an active booking that overlaps the range. */
    BOOKED,

    /** Nothing overlaps the range. */
    FREE
}
