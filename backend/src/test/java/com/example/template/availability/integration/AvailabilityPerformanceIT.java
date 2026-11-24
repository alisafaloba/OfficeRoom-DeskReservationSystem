package com.example.template.availability.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.AvailabilityApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * E4.T1 performance criterion: under 1 second for a floor with 300 resources and 10,000
 * bookings, measured over HTTP after one warm-up call. Reuses the availability fixtures.
 */
@DataSet("datasets/availability-users.yml")
@DisplayName("Availability API performance")
class AvailabilityPerformanceIT extends AbstractIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(AvailabilityPerformanceIT.class);

    private static final int RESOURCES = 300;
    private static final int BOOKINGS = 10_000;
    private static final Duration LIMIT = Duration.ofSeconds(1);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("answers in under 1 second for 300 resources and 10,000 bookings")
    void forFloor_largeFloor_under1Second() {
        var authApi = new AuthApiClient(restTemplate);
        String adminToken = authApi.accessTokenFor(TestUsers.AVAILABILITY_ADMIN_EMAIL, TestUsers.PASSWORD);
        String myToken = authApi.accessTokenFor(TestUsers.AVAILABILITY_ME_EMAIL, TestUsers.PASSWORD);
        String floorId = seedLargeFloor(adminToken);
        var availabilityApi = new AvailabilityApiClient(restTemplate);

        // One day, one week and the 31-day maximum (about 9,100 of the bookings overlap it).
        String[][] ranges = {
            {"2026-12-10T00:00:00Z", "2026-12-11T00:00:00Z"},
            {"2026-12-07T00:00:00Z", "2026-12-14T00:00:00Z"},
            {"2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z"},
        };
        availabilityApi.forFloor(myToken, floorId, ranges[2][0], ranges[2][1]); // warm-up

        for (String[] range : ranges) {
            long started = System.nanoTime();
            var response = availabilityApi.forFloor(myToken, floorId, range[0], range[1]);
            var elapsed = Duration.ofNanos(System.nanoTime() - started);
            log.info("Availability {} .. {} answered in {} ms", range[0], range[1], elapsed.toMillis());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(bodyOf(response).get("resources")).hasSize(RESOURCES);
            assertThat(elapsed).isLessThan(LIMIT);
        }
    }

    /**
     * 300 desks; 10,000 non-overlapping 09:00–17:00 bookings, one per desk per day from
     * 2026-12-01 on (34 days), every seventh by the caller; 30 desks blocked on one day.
     */
    private String seedLargeFloor(String adminToken) {
        var building = new BuildingApiClient(restTemplate)
                .create(adminToken, BuildingApiClient.body("Performance " + UUID.randomUUID(), "UTC"));
        var floor = new FloorApiClient(restTemplate)
                .create(adminToken, bodyOf(building).get("id").asString(), FloorApiClient.body("Large", 0));
        assertThat(floor.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID floorId = UUID.fromString(bodyOf(floor).get("id").asString());

        jdbcTemplate.update(
                """
                INSERT INTO resources (id, created_at, updated_at, version, floor_id, name, type)
                SELECT gen_random_uuid(), now(), now(), 0, ?, 'Desk ' || lpad(i::text, 3, '0'), 'DESK'
                FROM generate_series(1, ?) AS i
                """,
                floorId, RESOURCES);
        jdbcTemplate.update(
                """
                WITH desk AS (
                    SELECT id, row_number() OVER (ORDER BY name) - 1 AS n FROM resources WHERE floor_id = ?)
                INSERT INTO bookings (id, created_at, updated_at, version, resource_id, user_id, type, title,
                                      starts_at, ends_at, status)
                SELECT gen_random_uuid(), now(), now(), 0, desk.id,
                       CASE WHEN i % 7 = 0 THEN ? ELSE ? END, 'DESK', NULL,
                       timestamptz '2026-12-01 09:00:00+00' + (i / ?) * interval '1 day',
                       timestamptz '2026-12-01 17:00:00+00' + (i / ?) * interval '1 day',
                       'CONFIRMED'
                FROM generate_series(0, ? - 1) AS i
                JOIN desk ON desk.n = i % ?
                """,
                floorId,
                TestUsers.AVAILABILITY_ME_ID,
                TestUsers.AVAILABILITY_COLLEAGUE_ID,
                RESOURCES,
                RESOURCES,
                BOOKINGS,
                RESOURCES);
        jdbcTemplate.update(
                """
                INSERT INTO resource_blocks (id, created_at, updated_at, version, resource_id, starts_at, ends_at)
                SELECT gen_random_uuid(), now(), now(), 0, id,
                       timestamptz '2026-12-10 00:00:00+00', timestamptz '2026-12-11 00:00:00+00'
                FROM resources WHERE floor_id = ? ORDER BY name LIMIT 30
                """,
                floorId);
        jdbcTemplate.execute("ANALYZE resources, bookings, resource_blocks");

        Integer bookings = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM bookings b JOIN resources r ON r.id = b.resource_id WHERE r.floor_id = ?",
                Integer.class,
                floorId);
        assertThat(bookings).isEqualTo(BOOKINGS);
        return floorId.toString();
    }
}
