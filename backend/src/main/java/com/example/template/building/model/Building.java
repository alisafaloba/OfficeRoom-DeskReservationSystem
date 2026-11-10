package com.example.template.building.model;

import com.example.template.shared.model.BaseEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Top of the space hierarchy. Its opening hours and time zone validate bookings later (E5.T3). */
@Entity
@Table(name = "buildings")
@Getter
@Setter
@NoArgsConstructor
public class Building extends BaseEntity {

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 300)
    private String address;

    /** IANA zone id, e.g. {@code Europe/Bucharest}. */
    @Column(name = "time_zone", nullable = false, length = 64)
    private String timeZone;

    /** Rows are removed with the building by the database (ON DELETE CASCADE). */
    @ElementCollection
    @CollectionTable(name = "building_opening_hours", joinColumns = @JoinColumn(name = "building_id"))
    private List<OpeningHours> openingHours = new ArrayList<>();
}
