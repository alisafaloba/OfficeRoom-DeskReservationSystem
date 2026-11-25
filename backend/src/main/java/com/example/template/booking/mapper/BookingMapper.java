package com.example.template.booking.mapper;

import com.example.template.booking.dto.BookingResponse;
import com.example.template.booking.model.Booking;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Converts {@link Booking} entities to API DTOs. */
@Component
public class BookingMapper {

    public BookingResponse toResponse(Booking booking) {
        return new BookingResponse(
                booking.requireId(),
                booking.getResourceId(),
                booking.getUserId(),
                booking.getType(),
                booking.getTitle(),
                booking.getDescription(),
                booking.getStartsAt(),
                booking.getEndsAt(),
                booking.getStatus(),
                booking.getCancelReason(),
                booking.getAttendeeIds().stream().sorted().toList(),
                Objects.requireNonNull(booking.getCreatedAt(), "persisted booking has createdAt"),
                Objects.requireNonNull(booking.getUpdatedAt(), "persisted booking has updatedAt"));
    }
}
