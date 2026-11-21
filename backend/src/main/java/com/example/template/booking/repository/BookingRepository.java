package com.example.template.booking.repository;

import com.example.template.booking.model.Booking;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingRepository extends JpaRepository<Booking, UUID> {}
