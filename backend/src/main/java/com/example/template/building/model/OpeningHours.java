package com.example.template.building.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.time.DayOfWeek;
import java.time.LocalTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.jspecify.annotations.Nullable;

/** One weekday of a building's schedule. Both times null means the building is closed that day. */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
public class OpeningHours {

    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week", nullable = false, length = 9)
    private DayOfWeek dayOfWeek;

    @Column(name = "opens_at")
    private @Nullable LocalTime opensAt;

    @Column(name = "closes_at")
    private @Nullable LocalTime closesAt;

    public OpeningHours(DayOfWeek dayOfWeek, @Nullable LocalTime opensAt, @Nullable LocalTime closesAt) {
        this.dayOfWeek = dayOfWeek;
        this.opensAt = opensAt;
        this.closesAt = closesAt;
    }
}
