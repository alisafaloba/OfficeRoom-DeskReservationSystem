package com.example.template.availability.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.AvailabilityApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

/**
 * E4.T1 acceptance criteria end to end. Every test works on a floor of its own, so the shared
 * database needs no cleanup. Bookings and blocks have no API yet (E5, E8.T4) and are inserted
 * directly. The range under test is always 08:00–18:00 UTC on 2026-12-01.
 */
@DataSet("datasets/availability-users.yml")
@DisplayName("Availability API")
class AvailabilityControllerIT extends AbstractIntegrationTest {

    private static final String FROM = "2026-12-01T08:00:00Z";
    private static final String TO = "2026-12-01T18:00:00Z";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AvailabilityApiClient availabilityApi;
    private String adminToken;
    private String myToken;
    private String floorId;

    @BeforeEach
    void setUp() {
        var authApi = new AuthApiClient(restTemplate);
        availabilityApi = new AvailabilityApiClient(restTemplate);
        adminToken = authApi.accessTokenFor(TestUsers.AVAILABILITY_ADMIN_EMAIL, TestUsers.PASSWORD);
        myToken = authApi.accessTokenFor(TestUsers.AVAILABILITY_ME_EMAIL, TestUsers.PASSWORD);
        floorId = createFloor();
    }

    private String createFloor() {
        var building = new BuildingApiClient(restTemplate)
                .create(adminToken, BuildingApiClient.body("Availability " + UUID.randomUUID(), "UTC"));
        assertThat(building.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        var floor = new FloorApiClient(restTemplate)
                .create(adminToken, bodyOf(building).get("id").asString(), FloorApiClient.body("Ground", 0));
        assertThat(floor.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return bodyOf(floor).get("id").asString();
    }

    private UUID resource(String name) {
        return resource(floorId, name, "DESK");
    }

    private UUID resource(String onFloor, String name, String type) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO resources (id, created_at, updated_at, version, floor_id, name, type)"
                        + " VALUES (?, now(), now(), 0, ?, ?, ?)",
                id, UUID.fromString(onFloor), name, type);
        return id;
    }

    private void booking(UUID resourceId, UUID userId, String startsAt, String endsAt) {
        booking(resourceId, userId, startsAt, endsAt, null, "CONFIRMED");
    }

    private void booking(
            UUID resourceId, UUID userId, String startsAt, String endsAt, @Nullable String title, String status) {
        jdbcTemplate.update(
                "INSERT INTO bookings (id, created_at, updated_at, version, resource_id, user_id, type, title,"
                        + " starts_at, ends_at, status) VALUES (?, now(), now(), 0, ?, ?, 'DESK', ?, ?, ?, ?)",
                UUID.randomUUID(), resourceId, userId, title, ts(startsAt), ts(endsAt), status);
    }

    private void block(UUID resourceId, String startsAt, String endsAt) {
        jdbcTemplate.update(
                "INSERT INTO resource_blocks (id, created_at, updated_at, version, resource_id, starts_at, ends_at,"
                        + " reason) VALUES (?, now(), now(), 0, ?, ?, ?, 'Maintenance')",
                UUID.randomUUID(), resourceId, ts(startsAt), ts(endsAt));
    }

    private static Timestamp ts(String instant) {
        return Timestamp.from(Instant.parse(instant));
    }

    /** The day's range as seen by the caller, keyed by resource name. */
    private Map<String, JsonNode> byName(ResponseEntity<JsonNode> response) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        var result = new HashMap<String, JsonNode>();
        bodyOf(response).get("resources").forEach(r -> result.put(r.get("name").asString(), r));
        return result;
    }

    private Map<String, JsonNode> availability() {
        return byName(availabilityApi.forFloor(myToken, floorId, FROM, TO));
    }

    private static String status(JsonNode resource) {
        return resource.get("status").asString();
    }

    private static void assertBadRange(ResponseEntity<JsonNode> response, String code) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo(code);
    }

    // --- statuses ---

    @Test
    @DisplayName("reports FREE, BOOKED, BOOKED_BY_ME and UNAVAILABLE per resource, in name order")
    void forFloor_everyStatus() {
        resource("Desk A");
        booking(resource("Desk B"), TestUsers.AVAILABILITY_COLLEAGUE_ID, "2026-12-01T09:00:00Z", "2026-12-01T12:00:00Z");
        booking(resource("Desk C"), TestUsers.AVAILABILITY_ME_ID, "2026-12-01T09:00:00Z", "2026-12-01T12:00:00Z");
        block(resource("Desk D"), "2026-12-01T00:00:00Z", "2026-12-02T00:00:00Z");

        var response = availabilityApi.forFloor(myToken, floorId, FROM, TO);
        var resources = byName(response);

        assertThat(bodyOf(response).get("resources").valueStream().map(r -> r.get("name").asString()))
                .containsExactly("Desk A", "Desk B", "Desk C", "Desk D");
        assertThat(status(resources.get("Desk A"))).isEqualTo("FREE");
        assertThat(status(resources.get("Desk B"))).isEqualTo("BOOKED");
        assertThat(status(resources.get("Desk C"))).isEqualTo("BOOKED_BY_ME");
        assertThat(status(resources.get("Desk D"))).isEqualTo("UNAVAILABLE");
    }

    @Test
    @DisplayName("shows a RESTRICTED desk as unavailable to employees but free to admins; MAINTENANCE to both")
    void forFloor_restrictedFreeForAdminsOnly() {
        jdbcTemplate.update("UPDATE resources SET status = 'RESTRICTED' WHERE id = ?", resource("Desk R"));
        jdbcTemplate.update("UPDATE resources SET status = 'MAINTENANCE' WHERE id = ?", resource("Desk M"));

        var asEmployee = availability();
        var asAdmin = byName(availabilityApi.forFloor(adminToken, floorId, FROM, TO));

        assertThat(status(asEmployee.get("Desk R"))).isEqualTo("UNAVAILABLE");
        assertThat(status(asAdmin.get("Desk R"))).isEqualTo("FREE");
        assertThat(status(asEmployee.get("Desk M"))).isEqualTo("UNAVAILABLE");
        assertThat(status(asAdmin.get("Desk M"))).isEqualTo("UNAVAILABLE");
    }

    @Test
    @DisplayName("counts any partial overlap as booked, but not a booking that only touches the range")
    void forFloor_partialOverlap() {
        booking(resource("Starts before"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T07:00:00Z", "2026-12-01T08:01:00Z");
        booking(resource("Ends after"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T17:59:00Z", "2026-12-01T20:00:00Z");
        booking(resource("Spans range"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-11-30T00:00:00Z", "2026-12-03T00:00:00Z");
        booking(resource("Inside range"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T12:00:00Z", "2026-12-01T12:15:00Z");
        booking(resource("Ends at from"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T06:00:00Z", "2026-12-01T08:00:00Z");
        booking(resource("Starts at to"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T18:00:00Z", "2026-12-01T19:00:00Z");

        var resources = availability();

        assertThat(status(resources.get("Starts before"))).isEqualTo("BOOKED");
        assertThat(status(resources.get("Ends after"))).isEqualTo("BOOKED");
        assertThat(status(resources.get("Spans range"))).isEqualTo("BOOKED");
        assertThat(status(resources.get("Inside range"))).isEqualTo("BOOKED");
        assertThat(status(resources.get("Ends at from"))).isEqualTo("FREE");
        assertThat(status(resources.get("Starts at to"))).isEqualTo("FREE");
    }

    @Test
    @DisplayName("ignores completed, cancelled and no-show bookings and blocks outside the range")
    void forFloor_ignoresReleasedAndNonOverlapping() {
        booking(resource("Cancelled"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", null, "CANCELLED");
        booking(resource("No-show"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", null, "NO_SHOW");
        booking(resource("Checked in"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", null, "CHECKED_IN");
        booking(resource("Completed"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", null, "COMPLETED");
        block(resource("Blocked yesterday"), "2026-11-30T00:00:00Z", "2026-12-01T08:00:00Z");

        var resources = availability();

        assertThat(status(resources.get("Cancelled"))).isEqualTo("FREE");
        assertThat(resources.get("Cancelled").get("bookings")).isEmpty();
        assertThat(status(resources.get("No-show"))).isEqualTo("FREE");
        assertThat(status(resources.get("Checked in"))).isEqualTo("BOOKED");
        assertThat(status(resources.get("Completed"))).isEqualTo("FREE");
        assertThat(status(resources.get("Blocked yesterday"))).isEqualTo("FREE");
    }

    @Test
    @DisplayName("applies the priority UNAVAILABLE > BOOKED_BY_ME > BOOKED")
    void forFloor_priority() {
        UUID blockedAndMine = resource("Blocked and mine");
        block(blockedAndMine, "2026-12-01T13:00:00Z", "2026-12-01T14:00:00Z");
        booking(blockedAndMine, TestUsers.AVAILABILITY_ME_ID, "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z");
        UUID mineAndTheirs = resource("Mine and theirs");
        booking(mineAndTheirs, TestUsers.AVAILABILITY_COLLEAGUE_ID, "2026-12-01T08:00:00Z", "2026-12-01T09:00:00Z");
        booking(mineAndTheirs, TestUsers.AVAILABILITY_ME_ID, "2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z");

        var resources = availability();

        assertThat(status(resources.get("Blocked and mine"))).isEqualTo("UNAVAILABLE");
        assertThat(status(resources.get("Mine and theirs"))).isEqualTo("BOOKED_BY_ME");
        assertThat(resources.get("Mine and theirs").get("bookings").valueStream()
                        .map(b -> b.get("startsAt").asString()))
                .containsExactly("2026-12-01T08:00:00Z", "2026-12-01T15:00:00Z");
    }

    @Test
    @DisplayName("lists only the requested floor's resources and marks display-only ones")
    void forFloor_onlyThisFloor() {
        resource("Desk");
        resource(floorId, "Kitchen", "BREAK_ROOM");
        UUID elsewhere = resource(createFloor(), "Elsewhere", "DESK");
        booking(elsewhere, TestUsers.AVAILABILITY_COLLEAGUE_ID, "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z");

        var resources = availability();

        assertThat(resources).containsOnlyKeys("Desk", "Kitchen");
        assertThat(resources.get("Desk").get("bookable").asBoolean()).isTrue();
        assertThat(resources.get("Kitchen").get("bookable").asBoolean()).isFalse();
    }

    // --- privacy ---

    @Test
    @DisplayName("shows only the name, title and time of a colleague's booking")
    void forFloor_colleagueBookingSummary() {
        booking(resource("Room"), TestUsers.AVAILABILITY_COLLEAGUE_ID,
                "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", "Budget review", "CONFIRMED");

        var response = availabilityApi.forFloor(myToken, floorId, FROM, TO);
        JsonNode summary = byName(response).get("Room").get("bookings").get(0);

        assertThat(summary.propertyNames())
                .containsExactlyInAnyOrder("startsAt", "endsAt", "title", "bookedBy", "mine");
        assertThat(summary.get("bookedBy").asString()).isEqualTo("Ana Pop");
        assertThat(summary.get("title").asString()).isEqualTo("Budget review");
        assertThat(summary.get("mine").asBoolean()).isFalse();
        assertThat(summary.get("startsAt").asString()).isEqualTo("2026-12-01T09:00:00Z");
        assertThat(bodyOf(response).toString())
                .doesNotContain(TestUsers.AVAILABILITY_COLLEAGUE_EMAIL)
                .doesNotContain(TestUsers.AVAILABILITY_COLLEAGUE_ID.toString())
                .doesNotContain("Finance");
    }

    // --- access and errors ---

    @Test
    @DisplayName("answers 401 to anonymous callers")
    void forFloor_anonymous_returns401() {
        assertThat(availabilityApi.forFloor(null, floorId, FROM, TO).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("answers 404 FLOOR_NOT_FOUND for an unknown floor")
    void forFloor_unknownFloor_returns404() {
        var response = availabilityApi.forFloor(myToken, UUID.randomUUID().toString(), FROM, TO);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("FLOOR_NOT_FOUND");
    }

    @Test
    @DisplayName("answers 400 INVALID_TIME_RANGE when the start is not before the end")
    void forFloor_startNotBeforeEnd_returns400() {
        assertBadRange(availabilityApi.forFloor(myToken, floorId, TO, FROM), "INVALID_TIME_RANGE");
        assertBadRange(availabilityApi.forFloor(myToken, floorId, FROM, FROM), "INVALID_TIME_RANGE");
    }

    @Test
    @DisplayName("accepts 31 days and answers 400 INVALID_TIME_RANGE for anything longer")
    void forFloor_longerThan31Days_returns400() {
        assertThat(availabilityApi.forFloor(myToken, floorId, "2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z")
                        .getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertBadRange(
                availabilityApi.forFloor(myToken, floorId, "2026-12-01T00:00:00Z", "2027-01-01T00:00:01Z"),
                "INVALID_TIME_RANGE");
    }

    @Test
    @DisplayName("answers 400 VALIDATION_FAILED for a missing or malformed parameter")
    void forFloor_missingOrMalformedParameter_returns400() {
        assertBadRange(availabilityApi.forFloor(myToken, floorId, FROM, null), "VALIDATION_FAILED");
        assertBadRange(availabilityApi.forFloor(myToken, floorId, null, TO), "VALIDATION_FAILED");
        assertBadRange(availabilityApi.forFloor(myToken, floorId, "tomorrow", TO), "VALIDATION_FAILED");
    }
}
