package com.example.template.building.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

/** No {@code @Nested} groups: see UserControllerIT for why database-rider needs a flat class. */
@DataSet("datasets/building-users.yml")
@DisplayName("Building API")
class BuildingControllerIT extends AbstractIntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private BuildingApiClient buildingApi;
    private String adminToken;
    private String employeeToken;

    @BeforeEach
    void setUp() {
        var authApi = new AuthApiClient(restTemplate);
        buildingApi = new BuildingApiClient(restTemplate);
        adminToken = authApi.accessTokenFor(TestUsers.BUILDING_ADMIN_EMAIL, TestUsers.PASSWORD);
        employeeToken = authApi.accessTokenFor(TestUsers.BUILDING_EMPLOYEE_EMAIL, TestUsers.PASSWORD);
    }

    // Unique-minted: the shared database survives across classes and runs.
    private static String uniqueName() {
        return "Building " + UUID.randomUUID();
    }

    private String createBuilding(String name) {
        var response = buildingApi.create(adminToken, BuildingApiClient.body(name, "Europe/Bucharest"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return bodyOf(response).get("id").asString();
    }

    // --- reads ---

    @Test
    @DisplayName("lets an employee list and read buildings")
    void read_asEmployee_returns200() {
        String id = createBuilding(uniqueName());

        var list = buildingApi.list(employeeToken);
        var single = buildingApi.getById(employeeToken, id);

        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(list).isArray()).isTrue();
        assertThat(single.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("answers 401 to anonymous reads")
    void list_anonymous_returns401() {
        assertThat(buildingApi.list(null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("answers 404 BUILDING_NOT_FOUND for an unknown id")
    void getById_unknown_returns404() {
        var response = buildingApi.getById(adminToken, UUID.randomUUID().toString());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("BUILDING_NOT_FOUND");
    }

    // --- writes: authorization ---

    @Test
    @DisplayName("denies an employee every write with 403")
    void write_asEmployee_returns403() {
        String id = createBuilding(uniqueName());

        var create = buildingApi.create(employeeToken, BuildingApiClient.body(uniqueName(), "UTC"));
        var update = buildingApi.update(employeeToken, id, BuildingApiClient.body(uniqueName(), "UTC"));
        var delete = buildingApi.delete(employeeToken, id);

        assertThat(create.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(update.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(delete.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(buildingApi.getById(adminToken, id).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // --- create ---

    @Test
    @DisplayName("creates a building and returns its hours Monday to Sunday with no floors")
    void create_asAdmin_returns201() {
        String name = uniqueName();

        var response = buildingApi.create(adminToken, BuildingApiClient.body(name, "Europe/Bucharest"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode body = bodyOf(response);
        assertThat(body.get("name").asString()).isEqualTo(name);
        assertThat(body.get("timeZone").asString()).isEqualTo("Europe/Bucharest");
        assertThat(body.get("floorCount").asInt()).isZero();
        JsonNode hours = body.get("openingHours");
        assertThat(hours).hasSize(7);
        assertThat(hours.get(0).get("dayOfWeek").asString()).isEqualTo("MONDAY");
        assertThat(hours.get(0).get("opensAt").asString()).isEqualTo("08:00:00");
        assertThat(hours.get(6).get("dayOfWeek").asString()).isEqualTo("SUNDAY");
        assertThat(hours.get(6).get("opensAt").isNull()).isTrue();
    }

    @Test
    @DisplayName("rejects a duplicate name, ignoring case, with 409")
    void create_duplicateName_returns409() {
        String name = uniqueName();
        createBuilding(name);

        var response = buildingApi.create(adminToken, BuildingApiClient.body(name.toUpperCase(), "UTC"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("BUILDING_NAME_ALREADY_IN_USE");
    }

    @Test
    @DisplayName("rejects a missing name with 400")
    void create_blankName_returns400() {
        var response = buildingApi.create(adminToken, BuildingApiClient.body("  ", "UTC"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    @DisplayName("rejects an unknown time zone with 400")
    void create_unknownTimeZone_returns400() {
        for (String zone : new String[] {"Mars/Olympus_Mons", "+02:00", "not a zone"}) {
            var response = buildingApi.create(adminToken, BuildingApiClient.body(uniqueName(), zone));

            assertThat(response.getStatusCode()).as(zone).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(bodyOf(response).get("errors").has("timeZone")).as(zone).isTrue();
        }
    }

    @Test
    @DisplayName("rejects a closing time before the opening time with 400")
    void create_closingBeforeOpening_returns400() {
        var hours = new ArrayList<>(BuildingApiClient.defaultWeek());
        hours.set(2, Map.of("dayOfWeek", "WEDNESDAY", "opensAt", "18:00", "closesAt", "08:00"));

        var response = buildingApi.create(adminToken, withHours(hours));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response).get("errors").has("openingHours[2].closesAt")).isTrue();
    }

    @Test
    @DisplayName("rejects a day with only one of the two times with 400")
    void create_halfOpenDay_returns400() {
        var hours = new ArrayList<>(BuildingApiClient.defaultWeek());
        hours.set(0, Map.of("dayOfWeek", "MONDAY", "opensAt", "08:00"));

        var response = buildingApi.create(adminToken, withHours(hours));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("rejects a week that misses or repeats a day with 400")
    void create_incompleteWeek_returns400() {
        var missing = new ArrayList<>(BuildingApiClient.defaultWeek());
        missing.removeLast();
        var repeated = new ArrayList<>(BuildingApiClient.defaultWeek());
        repeated.set(6, Map.of("dayOfWeek", "MONDAY"));

        assertThat(buildingApi.create(adminToken, withHours(missing)).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(buildingApi.create(adminToken, withHours(repeated)).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // --- update ---

    @Test
    @DisplayName("updates every field, including the weekly hours")
    void update_asAdmin_replacesFields() {
        String id = createBuilding(uniqueName());
        String newName = uniqueName();
        var hours = new ArrayList<>(BuildingApiClient.defaultWeek());
        hours.set(5, Map.of("dayOfWeek", "SATURDAY", "opensAt", "10:00", "closesAt", "14:00"));
        hours.set(0, Map.of("dayOfWeek", "MONDAY"));
        var body = new HashMap<>(withHours(hours));
        body.put("name", newName);
        body.put("timeZone", "America/New_York");

        var response = buildingApi.update(adminToken, id, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode saved = bodyOf(buildingApi.getById(adminToken, id));
        assertThat(saved.get("name").asString()).isEqualTo(newName);
        assertThat(saved.get("timeZone").asString()).isEqualTo("America/New_York");
        assertThat(saved.get("openingHours").get(0).get("opensAt").isNull()).isTrue();
        assertThat(saved.get("openingHours").get(5).get("closesAt").asString()).isEqualTo("14:00:00");
    }

    @Test
    @DisplayName("lets a building keep its own name on update but not take another's")
    void update_name_conflictsOnlyWithOtherBuildings() {
        String ownName = uniqueName();
        String id = createBuilding(ownName);
        String otherName = uniqueName();
        createBuilding(otherName);

        var keepName = buildingApi.update(adminToken, id, BuildingApiClient.body(ownName, "UTC"));
        var takeOther = buildingApi.update(adminToken, id, BuildingApiClient.body(otherName, "UTC"));

        assertThat(keepName.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(takeOther.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("answers 404 when updating an unknown building")
    void update_unknown_returns404() {
        var response = buildingApi.update(
                adminToken, UUID.randomUUID().toString(), BuildingApiClient.body(uniqueName(), "UTC"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // --- delete ---

    @Test
    @DisplayName("deletes a building together with its opening hours")
    void delete_asAdmin_removesBuildingAndDependentRows() {
        String id = createBuilding(uniqueName());
        assertThat(openingHoursRows(id)).isEqualTo(7);

        var response = buildingApi.delete(adminToken, id);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(buildingApi.getById(adminToken, id).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(openingHoursRows(id)).isZero();
    }

    @Test
    @DisplayName("answers 404 when deleting an unknown building")
    void delete_unknown_returns404() {
        var response = buildingApi.delete(adminToken, UUID.randomUUID().toString());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    private Integer openingHoursRows(String buildingId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM building_opening_hours WHERE building_id = ?::uuid", Integer.class, buildingId);
    }

    private static Map<String, Object> withHours(java.util.List<Map<String, Object>> hours) {
        var body = new HashMap<>(BuildingApiClient.body(uniqueName(), "UTC"));
        body.put("openingHours", hours);
        return body;
    }
}
