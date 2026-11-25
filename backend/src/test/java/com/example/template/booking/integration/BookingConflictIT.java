package com.example.template.booking.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.dto.CreateBookingRequest;
import com.example.template.booking.dto.MoveBookingRequest;
import com.example.template.booking.service.BookingService;
import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.TestUsers;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import com.github.database.rider.core.api.dataset.DataSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * E5.T2 acceptance criteria: no two occupying bookings of one resource ever overlap. Every test
 * books resources of its own, so the shared database needs no cleanup.
 */
@DataSet("datasets/booking-conflict-users.yml")
@DisplayName("Booking conflict prevention")
class BookingConflictIT extends AbstractIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(BookingConflictIT.class);

    private static final int PARALLEL_REQUESTS = 20;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private BookingService bookingService;

    private UUID floorId;

    @BeforeEach
    void setUp() {
        UUID buildingId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO buildings (id, created_at, updated_at, version, name, address, time_zone)"
                        + " VALUES (?, now(), now(), 0, ?, 'Street 1', 'UTC')",
                buildingId, "Conflicts " + buildingId);
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

    /**
     * A user of its own, so parallel requests of different users race only for the resource and
     * never trip the one-desk-per-user rule (E5.T3), which has its own tests.
     */
    private UUID user() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, created_at, updated_at, version, email, password_hash, role,"
                        + " two_factor_enabled, failed_login_attempts)"
                        + " VALUES (?, now(), now(), 0, ?, 'unused', 'USER', false, 0)",
                id, "conflict-" + id + "@test.local");
        return id;
    }

    /** Inserts straight into the table, past every service check: only the database decides. */
    private void insert(UUID resourceId, String status, String startsAt, String endsAt) {
        jdbcTemplate.update(
                "INSERT INTO bookings (id, created_at, updated_at, version, resource_id, user_id, type,"
                        + " starts_at, ends_at, status) VALUES (?, now(), now(), 0, ?, ?, 'DESK', ?, ?, ?)",
                UUID.randomUUID(),
                resourceId,
                TestUsers.CONFLICT_USER_A_ID,
                Timestamp.from(Instant.parse(startsAt)),
                Timestamp.from(Instant.parse(endsAt)),
                status);
    }

    // --- the exclusion constraint itself ---

    @Test
    @DisplayName("has the exclusion constraint on resource and half-open time range for active bookings")
    void constraint_exists() {
        String definition = jdbcTemplate.queryForObject(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ex_bookings_no_overlap'",
                String.class);

        assertThat(definition)
                .contains("EXCLUDE USING gist")
                .contains("resource_id WITH =")
                .contains("tstzrange(starts_at, ends_at, '[)'::text) WITH &&")
                .contains("'CONFIRMED'")
                .contains("'CHECKED_IN'")
                .doesNotContain("'COMPLETED'");
    }

    @Test
    @DisplayName("rejects an overlapping active booking of the same resource at database level")
    void insert_overlapping_isRejected() {
        UUID desk = resource();
        insert(desk, "CONFIRMED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");

        assertThatThrownBy(() -> insert(desk, "CONFIRMED", "2026-12-01T10:59:00Z", "2026-12-01T12:00:00Z"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ex_bookings_no_overlap");
        assertThatThrownBy(() -> insert(desk, "CHECKED_IN", "2026-12-01T09:00:00Z", "2026-12-01T13:00:00Z"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ex_bookings_no_overlap");
    }

    @Test
    @DisplayName("allows back-to-back bookings (10:00–11:00 and 11:00–12:00)")
    void insert_backToBack_isAllowed() {
        UUID desk = resource();
        insert(desk, "CONFIRMED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");

        assertThatCode(() -> insert(desk, "CONFIRMED", "2026-12-01T11:00:00Z", "2026-12-01T12:00:00Z"))
                .doesNotThrowAnyException();
        assertThatCode(() -> insert(desk, "CONFIRMED", "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("lets cancelled, no-show and completed bookings never block a new one")
    void insert_overReleasedBookings_isAllowed() {
        UUID desk = resource();
        insert(desk, "CANCELLED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");
        insert(desk, "NO_SHOW", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");
        insert(desk, "COMPLETED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");

        assertThatCode(() -> insert(desk, "CONFIRMED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("allows the same slot on different resources")
    void insert_sameSlotOtherResource_isAllowed() {
        insert(resource(), "CONFIRMED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");

        assertThatCode(() -> insert(resource(), "CONFIRMED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("rejects moving an active booking onto an occupied slot at database level")
    void update_moveOntoOccupiedSlot_isRejected() {
        UUID desk = resource();
        insert(desk, "CONFIRMED", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");
        insert(desk, "CONFIRMED", "2026-12-01T14:00:00Z", "2026-12-01T15:00:00Z");

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "UPDATE bookings SET starts_at = '2026-12-01 10:30:00+00', ends_at = '2026-12-01 11:30:00+00'"
                                + " WHERE resource_id = ? AND starts_at = '2026-12-01 14:00:00+00'",
                        desk))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ex_bookings_no_overlap");
    }

    // --- through the service ---

    private static CreateBookingRequest desk(UUID resourceId, String startsAt, String endsAt) {
        return new CreateBookingRequest(
                resourceId, BookingType.DESK, Instant.parse(startsAt), Instant.parse(endsAt), null, null, null);
    }

    private static void assertConflict(Runnable call) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.BOOKING_CONFLICT));
    }

    @Test
    @DisplayName("service: books back-to-back slots and answers BOOKING_CONFLICT for an overlap")
    void create_backToBackAndOverlap() {
        UUID desk = resource();
        UUID a = TestUsers.CONFLICT_USER_A_ID;
        bookingService.create(a, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));
        bookingService.create(a, desk(desk, "2026-12-01T11:00:00Z", "2026-12-01T12:00:00Z"));

        assertConflict(() -> bookingService.create(
                TestUsers.CONFLICT_USER_B_ID, desk(desk, "2026-12-01T10:30:00Z", "2026-12-01T11:30:00Z")));
    }

    @Test
    @DisplayName("service: books a slot again once its booking is cancelled or a no-show")
    void create_afterCancelAndNoShow() {
        UUID desk = resource();
        var first = bookingService.create(
                TestUsers.CONFLICT_USER_A_ID, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));
        bookingService.cancel(first.id(), "Plans changed");
        var second = bookingService.create(
                TestUsers.CONFLICT_USER_B_ID, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));
        bookingService.markNoShow(second.id());

        var third = bookingService.create(
                TestUsers.CONFLICT_USER_A_ID, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));

        assertThat(third.status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    @DisplayName("service: answers ATTENDEE_NOT_FOUND, not a foreign key 500, for an attendee who is not a user")
    void create_unknownAttendee() {
        UUID room = resource();
        var request = new CreateBookingRequest(
                room,
                BookingType.MEETING_ROOM,
                Instant.parse("2026-12-01T10:00:00Z"),
                Instant.parse("2026-12-01T11:00:00Z"),
                "Planning",
                null,
                List.of(TestUsers.CONFLICT_USER_B_ID, UUID.randomUUID()));

        assertThatThrownBy(() -> bookingService.create(TestUsers.CONFLICT_USER_A_ID, request))
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.ATTENDEE_NOT_FOUND));
        var created = bookingService.create(
                TestUsers.CONFLICT_USER_A_ID,
                new CreateBookingRequest(
                        room,
                        BookingType.MEETING_ROOM,
                        Instant.parse("2026-12-01T10:00:00Z"),
                        Instant.parse("2026-12-01T11:00:00Z"),
                        "Planning",
                        null,
                        List.of(TestUsers.CONFLICT_USER_B_ID)));
        assertThat(created.attendeeIds()).containsExactly(TestUsers.CONFLICT_USER_B_ID);
    }

    private static MoveBookingRequest to(UUID resourceId, String startsAt, String endsAt) {
        return new MoveBookingRequest(resourceId, Instant.parse(startsAt), Instant.parse(endsAt));
    }

    @Test
    @DisplayName("service: rejects moving a booking onto an occupied slot, on the same or another resource")
    void move_ontoOccupiedSlot() {
        UUID desk = resource();
        UUID otherDesk = resource();
        UUID a = TestUsers.CONFLICT_USER_A_ID;
        UUID b = TestUsers.CONFLICT_USER_B_ID;
        bookingService.create(a, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));
        bookingService.create(a, desk(otherDesk, "2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z"));
        var mine = bookingService.create(b, desk(desk, "2026-12-01T13:00:00Z", "2026-12-01T14:00:00Z"));

        assertConflict(() -> bookingService.move(mine.id(), to(desk, "2026-12-01T10:30:00Z", "2026-12-01T11:30:00Z")));
        assertConflict(() ->
                bookingService.move(mine.id(), to(otherDesk, "2026-12-01T15:30:00Z", "2026-12-01T16:30:00Z")));
        assertThat(bookingService.getById(mine.id()).startsAt()).isEqualTo(Instant.parse("2026-12-01T13:00:00Z"));
    }

    @Test
    @DisplayName("service: moves a booking back-to-back with another and over part of its own old slot")
    void move_toFreeSlots() {
        UUID desk = resource();
        UUID otherDesk = resource();
        bookingService.create(TestUsers.CONFLICT_USER_A_ID, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));
        var mine = bookingService.create(
                TestUsers.CONFLICT_USER_B_ID, desk(desk, "2026-12-01T13:00:00Z", "2026-12-01T14:00:00Z"));

        var shifted = bookingService.move(mine.id(), to(desk, "2026-12-01T13:30:00Z", "2026-12-01T14:30:00Z"));
        var backToBack = bookingService.move(mine.id(), to(desk, "2026-12-01T11:00:00Z", "2026-12-01T12:00:00Z"));
        var elsewhere = bookingService.move(mine.id(), to(otherDesk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z"));

        assertThat(shifted.startsAt()).isEqualTo(Instant.parse("2026-12-01T13:30:00Z"));
        assertThat(backToBack.startsAt()).isEqualTo(Instant.parse("2026-12-01T11:00:00Z"));
        assertThat(elsewhere.resourceId()).isEqualTo(otherDesk);
    }

    // --- concurrency ---

    /**
     * How each parallel request ended. {@code lostAtDatabase} counts conflicts caught by the
     * exclusion constraint instead of the pre-check; with the per-resource lock it stays 0.
     */
    private record Outcomes(int succeeded, int conflicts, int lostAtDatabase, List<Throwable> unexpected) {}

    /**
     * Runs every task at the same instant (all threads wait at one gate) and sorts the results:
     * success, BOOKING_CONFLICT, or anything else (a deadlock, a lock timeout), which would be a
     * 500 for the client.
     */
    private static Outcomes runAtOnce(List<Callable<?>> tasks) throws Exception {
        var gate = new CountDownLatch(1);
        var futures = new ArrayList<Future<?>>();
        try (ExecutorService pool = Executors.newFixedThreadPool(tasks.size())) {
            for (Callable<?> task : tasks) {
                futures.add(pool.submit(() -> {
                    gate.await();
                    return task.call();
                }));
            }
            gate.countDown();
            int succeeded = 0;
            int conflicts = 0;
            int lostAtDatabase = 0;
            var unexpected = new ArrayList<Throwable>();
            for (Future<?> future : futures) {
                try {
                    future.get(30, TimeUnit.SECONDS);
                    succeeded++;
                } catch (ExecutionException e) {
                    if (e.getCause() instanceof ApiException api && api.errorCode() == ErrorCode.BOOKING_CONFLICT) {
                        conflicts++;
                        if (api.getMessage().contains("just booked")) {
                            lostAtDatabase++;
                        }
                    } else {
                        unexpected.add(e.getCause());
                    }
                }
            }
            return new Outcomes(succeeded, conflicts, lostAtDatabase, unexpected);
        }
    }

    private Integer occupyingBookings(UUID resourceId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM bookings WHERE resource_id = ? AND status IN ('CONFIRMED', 'CHECKED_IN')",
                Integer.class,
                resourceId);
    }

    @Test
    @DisplayName("20 parallel requests for the same slot: exactly 1 succeeds, 19 get BOOKING_CONFLICT, nothing else")
    void create_parallelRequestsForSameSlot() throws Exception {
        UUID desk = resource();
        var tasks = new ArrayList<Callable<?>>();
        for (int i = 0; i < PARALLEL_REQUESTS; i++) {
            UUID user = user();
            tasks.add(() -> bookingService.create(user, desk(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z")));
        }

        var outcomes = runAtOnce(tasks);
        log.info("Parallel create: {} succeeded, {} conflicts ({} caught by the database constraint)",
                outcomes.succeeded(), outcomes.conflicts(), outcomes.lostAtDatabase());

        assertThat(outcomes.unexpected()).isEmpty();
        assertThat(outcomes.succeeded()).isEqualTo(1);
        assertThat(outcomes.conflicts()).isEqualTo(PARALLEL_REQUESTS - 1);
        assertThat(occupyingBookings(desk)).isEqualTo(1);
    }

    @Test
    @DisplayName("20 bookings moved onto the same free slot in parallel: exactly 1 succeeds, 19 get BOOKING_CONFLICT")
    void move_parallelMovesOntoSameSlot() throws Exception {
        UUID desk = resource();
        var tasks = new ArrayList<Callable<?>>();
        for (int i = 0; i < PARALLEL_REQUESTS; i++) {
            String day = "2026-12-%02d".formatted(2 + i);
            var booking = bookingService.create(user(), desk(desk, day + "T10:00:00Z", day + "T11:00:00Z"));
            tasks.add(() -> bookingService.move(booking.id(), to(desk, "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z")));
        }

        var outcomes = runAtOnce(tasks);
        log.info("Parallel move: {} succeeded, {} conflicts ({} caught by the database constraint)",
                outcomes.succeeded(), outcomes.conflicts(), outcomes.lostAtDatabase());

        assertThat(outcomes.unexpected()).isEmpty();
        assertThat(outcomes.succeeded()).isEqualTo(1);
        assertThat(outcomes.conflicts()).isEqualTo(PARALLEL_REQUESTS - 1);
        Integer onTarget = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM bookings WHERE resource_id = ? AND starts_at = '2026-12-01 10:00:00+00'",
                Integer.class,
                desk);
        assertThat(onTarget).isEqualTo(1);
        assertThat(occupyingBookings(desk)).isEqualTo(PARALLEL_REQUESTS);
    }
}
