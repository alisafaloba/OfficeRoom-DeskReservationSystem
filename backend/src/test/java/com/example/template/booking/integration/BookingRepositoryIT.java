package com.example.template.booking.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * E5.T1 repository queries and table constraints against the real schema. Every test books
 * resources of its own, so the shared database needs no cleanup. Range under test:
 * 2026-12-01 08:00–18:00 UTC.
 */
@DataSet("datasets/booking-users.yml")
@DisplayName("BookingRepository")
class BookingRepositoryIT extends AbstractIntegrationTest {

    private static final Instant FROM = Instant.parse("2026-12-01T08:00:00Z");
    private static final Instant TO = Instant.parse("2026-12-01T18:00:00Z");

    @Autowired
    private BookingRepository bookingRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID floorId;

    @BeforeEach
    void setUp() {
        UUID buildingId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO buildings (id, created_at, updated_at, version, name, address, time_zone)"
                        + " VALUES (?, now(), now(), 0, ?, 'Street 1', 'UTC')",
                buildingId, "Bookings " + buildingId);
        floorId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO floors (id, created_at, updated_at, version, building_id, name, number, sort_order)"
                        + " VALUES (?, now(), now(), 0, ?, 'Ground', 0, 0)",
                floorId, buildingId);
    }

    private UUID resource() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO resources (id, created_at, updated_at, version, floor_id, name, type)"
                        + " VALUES (?, now(), now(), 0, ?, ?, 'DESK')",
                id, floorId, "Desk " + id);
        return id;
    }

    private Booking book(UUID resourceId, UUID userId, String startsAt, String endsAt) {
        return book(resourceId, userId, startsAt, endsAt, BookingStatus.CONFIRMED);
    }

    private Booking book(UUID resourceId, UUID userId, String startsAt, String endsAt, BookingStatus status) {
        var booking = new Booking(
                resourceId, userId, BookingType.DESK, Instant.parse(startsAt), Instant.parse(endsAt));
        booking.setStatus(status);
        return bookingRepository.saveAndFlush(booking);
    }

    private static List<UUID> ids(List<Booking> bookings) {
        return bookings.stream().map(Booking::requireId).toList();
    }

    // --- overlap per resource ---

    @Test
    @DisplayName("finds every partial overlap per resource, earliest first, and skips touching ends")
    void findOccupyingOverlappingForResource_overlapRule() {
        UUID desk = resource();
        UUID a = TestUsers.BOOKING_USER_A_ID;
        var startsBefore = book(desk, a, "2026-12-01T07:00:00Z", "2026-12-01T08:01:00Z");
        var inside = book(desk, a, "2026-12-01T12:00:00Z", "2026-12-01T12:15:00Z");
        var endsAfter = book(desk, a, "2026-12-01T17:59:00Z", "2026-12-01T20:00:00Z");
        book(desk, a, "2026-12-01T06:00:00Z", "2026-12-01T08:00:00Z"); // ends at from
        book(desk, a, "2026-12-01T18:00:00Z", "2026-12-01T19:00:00Z"); // starts at to
        book(resource(), a, "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z"); // other resource

        var found = bookingRepository.findOccupyingOverlappingForResource(desk, FROM, TO);

        assertThat(ids(found)).containsExactly(startsBefore.requireId(), inside.requireId(), endsAfter.requireId());
    }

    @Test
    @DisplayName("finds a booking that spans the whole range")
    void findOccupyingOverlappingForResource_spanning() {
        UUID desk = resource();
        var spanning = book(desk, TestUsers.BOOKING_USER_A_ID, "2026-11-30T00:00:00Z", "2026-12-03T00:00:00Z");

        assertThat(ids(bookingRepository.findOccupyingOverlappingForResource(desk, FROM, TO)))
                .containsExactly(spanning.requireId());
    }

    @Test
    @DisplayName("counts confirmed, checked-in and completed bookings as occupying; all statuses on request")
    void findOverlappingForResource_statuses() {
        UUID desk = resource();
        UUID a = TestUsers.BOOKING_USER_A_ID;
        var confirmed = book(desk, a, "2026-12-01T08:00:00Z", "2026-12-01T09:00:00Z", BookingStatus.CONFIRMED);
        var checkedIn = book(desk, a, "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", BookingStatus.CHECKED_IN);
        var completed = book(desk, a, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z", BookingStatus.COMPLETED);
        var cancelled = book(desk, a, "2026-12-01T11:00:00Z", "2026-12-01T12:00:00Z", BookingStatus.CANCELLED);
        var noShow = book(desk, a, "2026-12-01T12:00:00Z", "2026-12-01T13:00:00Z", BookingStatus.NO_SHOW);

        assertThat(ids(bookingRepository.findOccupyingOverlappingForResource(desk, FROM, TO)))
                .containsExactly(confirmed.requireId(), checkedIn.requireId(), completed.requireId());
        assertThat(ids(bookingRepository.findAllOverlappingForResource(desk, FROM, TO)))
                .containsExactly(
                        confirmed.requireId(),
                        checkedIn.requireId(),
                        completed.requireId(),
                        cancelled.requireId(),
                        noShow.requireId());
    }

    // --- by user ---

    @Test
    @DisplayName("finds only the user's own overlapping bookings, in every status, earliest first")
    void findOverlappingForUser() {
        UUID desk = resource();
        UUID otherDesk = resource();
        UUID a = TestUsers.BOOKING_USER_A_ID;
        var later = book(otherDesk, a, "2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z", BookingStatus.CANCELLED);
        var earlier = book(desk, a, "2026-12-01T07:30:00Z", "2026-12-01T09:00:00Z");
        book(desk, a, "2026-12-02T09:00:00Z", "2026-12-02T10:00:00Z"); // next day
        book(desk, TestUsers.BOOKING_USER_B_ID, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"); // someone else

        var found = bookingRepository.findOverlappingForUser(a, FROM, TO);

        assertThat(ids(found)).containsExactly(earlier.requireId(), later.requireId());
    }

    // --- mapping and constraints ---

    @Test
    @DisplayName("stores meeting details and attendees and loads them back")
    void save_meetingRoomBooking_roundTrips() {
        var booking = new Booking(
                resource(),
                TestUsers.BOOKING_USER_A_ID,
                BookingType.MEETING_ROOM,
                Instant.parse("2026-12-01T09:00:00Z"),
                Instant.parse("2026-12-01T10:00:00Z"));
        booking.setTitle("Sprint review");
        booking.setDescription("Demo of E5");
        booking.getAttendeeIds().add(TestUsers.BOOKING_USER_B_ID);
        UUID id = bookingRepository.saveAndFlush(booking).requireId();

        var loaded = bookingRepository
                .findOccupyingOverlappingForResource(booking.getResourceId(), FROM, TO)
                .getFirst();

        assertThat(loaded.requireId()).isEqualTo(id);
        assertThat(loaded.getType()).isEqualTo(BookingType.MEETING_ROOM);
        assertThat(loaded.getTitle()).isEqualTo("Sprint review");
        assertThat(loaded.getDescription()).isEqualTo("Demo of E5");
        assertThat(loaded.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(loaded.getAttendeeIds()).isEqualTo(Set.of(TestUsers.BOOKING_USER_B_ID));
    }

    @Test
    @DisplayName("rejects a booking whose start is not before its end at database level")
    void insert_startNotBeforeEnd_isRejected() {
        UUID desk = resource();

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "INSERT INTO bookings (id, created_at, updated_at, version, resource_id, user_id, type,"
                                + " starts_at, ends_at, status) VALUES (?, now(), now(), 0, ?, ?, 'DESK',"
                                + " '2026-12-01 10:00:00+00', '2026-12-01 10:00:00+00', 'CONFIRMED')",
                        UUID.randomUUID(), desk, TestUsers.BOOKING_USER_A_ID))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_bookings_range");
    }

    @Test
    @DisplayName("rejects a cancel reason on a booking that is not cancelled")
    void insert_cancelReasonWithoutCancel_isRejected() {
        UUID desk = resource();

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "INSERT INTO bookings (id, created_at, updated_at, version, resource_id, user_id, type,"
                                + " starts_at, ends_at, status, cancel_reason) VALUES (?, now(), now(), 0, ?, ?,"
                                + " 'DESK', '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00', 'CONFIRMED', 'x')",
                        UUID.randomUUID(), desk, TestUsers.BOOKING_USER_A_ID))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_bookings_cancel_reason");
    }

    @Test
    @DisplayName("has the indexes on (resource, start, end) and (user, start)")
    void indexes_exist() {
        var definitions = jdbcTemplate.queryForList(
                "SELECT indexdef FROM pg_indexes WHERE tablename = 'bookings'", String.class);

        assertThat(definitions)
                .anySatisfy(d -> assertThat(d).contains("ix_bookings_resource_start_end")
                        .contains("(resource_id, starts_at, ends_at)"))
                .anySatisfy(d -> assertThat(d).contains("ix_bookings_user_start").contains("(user_id, starts_at)"));
    }
}
