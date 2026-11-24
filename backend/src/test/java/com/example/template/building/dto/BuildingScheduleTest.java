package com.example.template.building.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("BuildingSchedule")
class BuildingScheduleTest {

    private final BuildingSchedule schedule = new BuildingSchedule(
            UUID.randomUUID(),
            "Europe/Bucharest",
            List.of(
                    new OpeningHoursDto(DayOfWeek.MONDAY, LocalTime.of(8, 0), LocalTime.of(18, 0)),
                    new OpeningHoursDto(DayOfWeek.SATURDAY, null, null)));

    @Test
    @DisplayName("answers the hours of a listed day")
    void listedDay() {
        assertThat(schedule.hoursOn(DayOfWeek.MONDAY))
                .isEqualTo(new OpeningHoursDto(DayOfWeek.MONDAY, LocalTime.of(8, 0), LocalTime.of(18, 0)));
    }

    @Test
    @DisplayName("treats a missing day like a closed one")
    void missingDay() {
        assertThat(schedule.hoursOn(DayOfWeek.TUESDAY)).isEqualTo(new OpeningHoursDto(DayOfWeek.TUESDAY, null, null));
    }

    @Test
    @DisplayName("parses its time zone")
    void zone() {
        assertThat(schedule.zone()).isEqualTo(ZoneId.of("Europe/Bucharest"));
    }
}
