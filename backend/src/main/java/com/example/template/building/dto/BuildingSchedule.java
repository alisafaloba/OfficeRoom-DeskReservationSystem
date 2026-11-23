package com.example.template.building.dto;

import java.time.DayOfWeek;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * When a building is open, for the booking flows (E5.T3 desks, E5.T4 meeting rooms): its time
 * zone and its weekly opening hours.
 *
 * @param timeZone IANA zone id, validated when the building is saved
 * @param openingHours Monday through Sunday; a missing day counts as closed
 */
public record BuildingSchedule(UUID buildingId, String timeZone, List<OpeningHoursDto> openingHours) {

    public BuildingSchedule {
        openingHours = List.copyOf(openingHours);
    }

    public ZoneId zone() {
        return ZoneId.of(timeZone);
    }

    /** The hours of that weekday; both times {@code null} when the building is closed. */
    public OpeningHoursDto hoursOn(DayOfWeek day) {
        return openingHours.stream()
                .filter(hours -> hours.dayOfWeek() == day)
                .findFirst()
                .orElseGet(() -> new OpeningHoursDto(day, null, null));
    }
}
