package com.example.template.booking.service;

import java.time.LocalTime;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Desk booking settings (E5.T3), bound from {@code app.booking.desk.*}.
 *
 * @param halfDaySplit where the morning ends and the afternoon starts, in the building's time zone
 * @param maxDaysAhead how many days after today (in the building's time zone) a desk can be booked;
 *     a stand-in until the booking rules (E8.T5) make it configurable per office
 */
@ConfigurationProperties(prefix = "app.booking.desk")
public record DeskBookingProperties(
        @DefaultValue("13:00") LocalTime halfDaySplit, @DefaultValue("90") int maxDaysAhead) {

    public DeskBookingProperties {
        if (maxDaysAhead < 0) {
            throw new IllegalArgumentException("app.booking.desk.max-days-ahead must not be negative");
        }
    }
}
