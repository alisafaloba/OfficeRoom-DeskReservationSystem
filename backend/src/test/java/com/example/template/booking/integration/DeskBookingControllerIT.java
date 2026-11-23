package com.example.template.booking.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.DeskBookingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
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
 * E5.T3 acceptance criteria end to end. The building is in Europe/Bucharest, open 08:00–18:00 on
 * weekdays and closed at weekends, so local times and UTC instants differ. Every test books its
 * own desk on a Monday at least a week ahead, so tests never collide with each other.
 */
@DataSet("datasets/desk-booking-users.yml")
@DisplayName("Desk booking API")
class DeskBookingControllerIT extends AbstractIntegrationTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Bucharest");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DeskBookingApiClient deskApi;
    private String tokenA;
    private String tokenB;
    private String floorId;
    private LocalDate monday;

    @BeforeEach
    void setUp() {
        var authApi = new AuthApiClient(restTemplate);
        deskApi = new DeskBookingApiClient(restTemplate);
        String adminToken = authApi.accessTokenFor(TestUsers.DESK_ADMIN_EMAIL, TestUsers.PASSWORD);
        tokenA = authApi.accessTokenFor(TestUsers.DESK_USER_A_EMAIL, TestUsers.PASSWORD);
        tokenB = authApi.accessTokenFor(TestUsers.DESK_USER_B_EMAIL, TestUsers.PASSWORD);

        var building = new BuildingApiClient(restTemplate)
                .create(adminToken, BuildingApiClient.body("Desks " + UUID.randomUUID(), ZONE.getId()));
        assertThat(building.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        var floor = new FloorApiClient(restTemplate)
                .create(adminToken, bodyOf(building).get("id").asString(), FloorApiClient.body("Ground", 0));
        assertThat(floor.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        floorId = bodyOf(floor).get("id").asString();
        monday = LocalDate.now(ZONE).with(TemporalAdjusters.next(DayOfWeek.MONDAY)).plusWeeks(1);
    }

    private String resource(String type) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO resources (id, created_at, updated_at, version, floor_id, name, type)"
                        + " VALUES (?, now(), now(), 0, ?, ?, ?)",
                id, UUID.fromString(floorId), "Desk " + id, type);
        return id.toString();
    }

    private String desk() {
        return resource("DESK");
    }

    private ResponseEntity<JsonNode> book(String token, String resourceId, LocalDate date, String mode) {
        return book(token, resourceId, date, mode, null, null);
    }

    private ResponseEntity<JsonNode> book(
            String token,
            String resourceId,
            LocalDate date,
            String mode,
            @Nullable String startTime,
            @Nullable String endTime) {
        return deskApi.book(token, DeskBookingApiClient.body(resourceId, date.toString(), mode, startTime, endTime));
    }

    private static Instant at(LocalDate date, String localTime) {
        return date.atTime(LocalTime.parse(localTime)).atZone(ZONE).toInstant();
    }

    private static void assertCreated(ResponseEntity<JsonNode> response, Instant startsAt, Instant endsAt) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        var booking = bodyOf(response).get("booking");
        assertThat(Instant.parse(booking.get("startsAt").asString())).isEqualTo(startsAt);
        assertThat(Instant.parse(booking.get("endsAt").asString())).isEqualTo(endsAt);
        assertThat(booking.get("status").asString()).isEqualTo("CONFIRMED");
        assertThat(booking.get("type").asString()).isEqualTo("DESK");
    }

    private static void assertError(ResponseEntity<JsonNode> response, HttpStatus status, String code) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo(code);
    }

    // --- modes ---

    @Test
    @DisplayName("books a full day from opening to closing time in the building's time zone")
    void fullDay() {
        var response = book(tokenA, desk(), monday, "FULL_DAY");

        assertCreated(response, at(monday, "08:00"), at(monday, "18:00"));
        var body = bodyOf(response);
        assertThat(body.get("timeZone").asString()).isEqualTo("Europe/Bucharest");
        assertThat(body.get("date").asString()).isEqualTo(monday.toString());
        assertThat(LocalTime.parse(body.get("startTime").asString())).isEqualTo(LocalTime.of(8, 0));
        assertThat(LocalTime.parse(body.get("endTime").asString())).isEqualTo(LocalTime.of(18, 0));
        assertThat(bodyOf(response).get("booking").get("userId").asString())
                .isEqualTo(TestUsers.DESK_USER_A_ID.toString());
    }

    @Test
    @DisplayName("splits the day into a morning and an afternoon at 13:00")
    void halfDays() {
        String desk = desk();

        assertCreated(book(tokenA, desk, monday, "MORNING"), at(monday, "08:00"), at(monday, "13:00"));
        assertCreated(book(tokenB, desk, monday, "AFTERNOON"), at(monday, "13:00"), at(monday, "18:00"));
    }

    @Test
    @DisplayName("books a custom slot in 15-minute steps")
    void custom() {
        assertCreated(
                book(tokenA, desk(), monday, "CUSTOM", "09:15", "10:45"), at(monday, "09:15"), at(monday, "10:45"));
    }

    @Test
    @DisplayName("treats phone booths and parking spots like desks")
    void deskLikeResources() {
        assertCreated(book(tokenA, resource("PHONE_BOOTH"), monday, "MORNING"), at(monday, "08:00"), at(monday, "13:00"));
        assertCreated(book(tokenA, resource("PARKING_SPOT"), monday, "MORNING"), at(monday, "08:00"), at(monday, "13:00"));
    }

    // --- 400 ---

    @Test
    @DisplayName("rejects a custom slot outside the opening hours with 400")
    void outsideOpeningHours() {
        assertError(
                book(tokenA, desk(), monday, "CUSTOM", "07:00", "09:00"),
                HttpStatus.BAD_REQUEST,
                "OUTSIDE_OPENING_HOURS");
    }

    @Test
    @DisplayName("rejects a day the building is closed with 400")
    void closedDay() {
        assertError(book(tokenA, desk(), monday.plusDays(5), "FULL_DAY"), HttpStatus.BAD_REQUEST, "OUTSIDE_OPENING_HOURS");
    }

    @Test
    @DisplayName("rejects a booking in the past with 400")
    void inThePast() {
        LocalDate lastMonday = LocalDate.now(ZONE).with(TemporalAdjusters.previous(DayOfWeek.MONDAY));

        assertError(book(tokenA, desk(), lastMonday, "FULL_DAY"), HttpStatus.BAD_REQUEST, "BOOKING_IN_PAST");
    }

    @Test
    @DisplayName("rejects an end before the start with 400")
    void endBeforeStart() {
        assertError(
                book(tokenA, desk(), monday, "CUSTOM", "11:00", "10:00"),
                HttpStatus.BAD_REQUEST,
                "INVALID_TIME_RANGE");
    }

    @Test
    @DisplayName("rejects custom times off the 15-minute grid with 400")
    void offGrid() {
        assertError(
                book(tokenA, desk(), monday, "CUSTOM", "09:10", "10:00"), HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
    }

    @Test
    @DisplayName("rejects a request without a mode with 400")
    void missingMode() {
        var body = Map.<String, Object>of("resourceId", desk(), "date", monday.toString());

        assertError(deskApi.book(tokenA, body), HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
    }

    @Test
    @DisplayName("rejects a resource that cannot be booked with 400")
    void notBookable() {
        assertError(book(tokenA, resource("BREAK_ROOM"), monday, "FULL_DAY"), HttpStatus.BAD_REQUEST, "RESOURCE_NOT_BOOKABLE");
    }

    // --- 404, 409, 401 ---

    @Test
    @DisplayName("answers 404 for an unknown desk")
    void unknownDesk() {
        assertError(
                book(tokenA, UUID.randomUUID().toString(), monday, "FULL_DAY"),
                HttpStatus.NOT_FOUND,
                "RESOURCE_NOT_FOUND");
    }

    @Test
    @DisplayName("answers 409 BOOKING_CONFLICT when someone else holds the desk")
    void taken() {
        String desk = desk();
        assertCreated(book(tokenA, desk, monday, "MORNING"), at(monday, "08:00"), at(monday, "13:00"));

        assertError(book(tokenB, desk, monday, "CUSTOM", "12:00", "14:00"), HttpStatus.CONFLICT, "BOOKING_CONFLICT");
    }

    @Test
    @DisplayName("answers 409 RESOURCE_UNAVAILABLE when an admin blocked the desk")
    void blocked() {
        String desk = desk();
        jdbcTemplate.update(
                "INSERT INTO resource_blocks (id, created_at, updated_at, version, resource_id, starts_at, ends_at,"
                        + " reason) VALUES (?, now(), now(), 0, ?, ?, ?, 'Maintenance')",
                UUID.randomUUID(),
                UUID.fromString(desk),
                Timestamp.from(at(monday, "12:00")),
                Timestamp.from(at(monday, "15:00")));

        assertError(book(tokenA, desk, monday, "AFTERNOON"), HttpStatus.CONFLICT, "RESOURCE_UNAVAILABLE");
    }

    @Test
    @DisplayName("answers 401 without a token")
    void anonymous() {
        var response = deskApi.book(null, DeskBookingApiClient.body(desk(), monday.toString(), "FULL_DAY", null, null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
