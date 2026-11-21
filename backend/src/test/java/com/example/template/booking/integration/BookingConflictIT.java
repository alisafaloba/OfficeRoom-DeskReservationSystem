package com.example.template.booking.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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

    @Autowired
    private JdbcTemplate jdbcTemplate;

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
}
