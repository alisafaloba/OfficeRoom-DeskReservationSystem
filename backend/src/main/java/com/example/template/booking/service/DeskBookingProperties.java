package com.example.template.booking.service;

import java.time.LocalTime;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Desk booking settings (E5.T3), bound from {@code app.booking.desk.*}.
 *
 * @param halfDaySplit where the morning ends and the afternoon starts, in the building's time zone
 */
@ConfigurationProperties(prefix = "app.booking.desk")
public record DeskBookingProperties(@DefaultValue("13:00") LocalTime halfDaySplit) {}
