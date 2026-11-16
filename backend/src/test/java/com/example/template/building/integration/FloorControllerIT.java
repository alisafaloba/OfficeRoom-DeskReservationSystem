package com.example.template.building.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

/**
 * E2.T2 acceptance criteria end to end. Every test works in a building of its own, so the
 * shared database needs no cleanup. No {@code @Nested} groups: see UserControllerIT for why.
 */
@DataSet("datasets/floor-users.yml")
@DisplayName("Floor API")
class FloorControllerIT extends AbstractIntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private BuildingApiClient buildingApi;
    private FloorApiClient floorApi;
    private String adminToken;
    private String employeeToken;

    @BeforeEach
    void setUp() {
        var authApi = new AuthApiClient(restTemplate);
        buildingApi = new BuildingApiClient(restTemplate);
        floorApi = new FloorApiClient(restTemplate);
        adminToken = authApi.accessTokenFor(TestUsers.FLOOR_ADMIN_EMAIL, TestUsers.PASSWORD);
        employeeToken = authApi.accessTokenFor(TestUsers.FLOOR_EMPLOYEE_EMAIL, TestUsers.PASSWORD);
    }

    private String createBuilding() {
        var response = buildingApi.create(adminToken, BuildingApiClient.body("Floors " + UUID.randomUUID(), "UTC"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return bodyOf(response).get("id").asString();
    }

    private String createFloor(String buildingId, String name, int number) {
        var response = floorApi.create(adminToken, buildingId, FloorApiClient.body(name, number));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return bodyOf(response).get("id").asString();
    }

    private List<String> names(ResponseEntity<JsonNode> listResponse) {
        assertThat(listResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        var names = new ArrayList<String>();
        bodyOf(listResponse).forEach(floor -> names.add(floor.get("name").asString()));
        return names;
    }

    private static String code(ResponseEntity<JsonNode> response) {
        return bodyOf(response).get("code").asString();
    }

    // --- reads ---

    @Test
    @DisplayName("lets an employee list and read the floors of a building")
    void read_asEmployee_returns200() {
        String buildingId = createBuilding();
        String floorId = createFloor(buildingId, "Ground floor", 0);

        assertThat(names(floorApi.list(employeeToken, buildingId))).containsExactly("Ground floor");
        var single = floorApi.getById(employeeToken, buildingId, floorId);
        assertThat(single.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(single).get("buildingId").asString()).isEqualTo(buildingId);
    }

    @Test
    @DisplayName("answers 401 to anonymous reads")
    void list_anonymous_returns401() {
        String buildingId = createBuilding();

        assertThat(floorApi.list(null, buildingId).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("answers 404 BUILDING_NOT_FOUND for the floors of an unknown building")
    void list_unknownBuilding_returns404() {
        var response = floorApi.list(adminToken, UUID.randomUUID().toString());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(response)).isEqualTo("BUILDING_NOT_FOUND");
    }

    @Test
    @DisplayName("answers 404 FLOOR_NOT_FOUND for an unknown floor and for a floor of another building")
    void getById_unknownOrForeignFloor_returns404() {
        String buildingId = createBuilding();
        String otherBuildingId = createBuilding();
        String foreignFloorId = createFloor(otherBuildingId, "Elsewhere", 0);

        var unknown = floorApi.getById(adminToken, buildingId, UUID.randomUUID().toString());
        var foreign = floorApi.getById(adminToken, buildingId, foreignFloorId);

        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(unknown)).isEqualTo("FLOOR_NOT_FOUND");
        assertThat(foreign.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(foreign)).isEqualTo("FLOOR_NOT_FOUND");
    }

    // --- writes: authorization ---

    @Test
    @DisplayName("denies an employee every write with 403")
    void write_asEmployee_returns403() {
        String buildingId = createBuilding();
        String floorId = createFloor(buildingId, "Ground floor", 0);

        var create = floorApi.create(employeeToken, buildingId, FloorApiClient.body("Roof", 9));
        var update = floorApi.update(employeeToken, buildingId, floorId, FloorApiClient.body("Lobby", 0));
        var reorder = floorApi.reorder(employeeToken, buildingId, FloorApiClient.order(List.of(floorId)));
        var delete = floorApi.delete(employeeToken, buildingId, floorId);

        assertThat(List.of(create, update, reorder, delete))
                .allSatisfy(response -> assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(names(floorApi.list(adminToken, buildingId))).containsExactly("Ground floor");
    }

    // --- create ---

    @Test
    @DisplayName("creates floors, appending each new one to the end of the display order")
    void create_asAdmin_appendsToDisplayOrder() {
        String buildingId = createBuilding();

        var response = floorApi.create(adminToken, buildingId, FloorApiClient.body("  Basement ", -1));
        createFloor(buildingId, "Third floor", 3);
        createFloor(buildingId, "Ground floor", 0);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode body = bodyOf(response);
        assertThat(body.get("name").asString()).isEqualTo("Basement");
        assertThat(body.get("number").asInt()).isEqualTo(-1);
        assertThat(body.get("sortOrder").asInt()).isZero();
        assertThat(names(floorApi.list(adminToken, buildingId)))
                .containsExactly("Basement", "Third floor", "Ground floor");
    }

    @Test
    @DisplayName("rejects a floor number already used in the same building with 409, but not in another building")
    void create_duplicateNumber_returns409OnlyWithinBuilding() {
        String buildingId = createBuilding();
        String otherBuildingId = createBuilding();
        createFloor(buildingId, "First floor", 1);

        var sameBuilding = floorApi.create(adminToken, buildingId, FloorApiClient.body("Also first", 1));
        var otherBuilding = floorApi.create(adminToken, otherBuildingId, FloorApiClient.body("First floor", 1));

        assertThat(sameBuilding.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(code(sameBuilding)).isEqualTo("FLOOR_NUMBER_ALREADY_IN_USE");
        assertThat(otherBuilding.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("rejects a blank name, a missing or out-of-range number and an unparsable number with 400")
    void create_invalidBody_returns400() {
        String buildingId = createBuilding();
        List<Map<String, Object>> invalid = List.of(
                FloorApiClient.body("  ", 1),
                Map.of("name", "No number"),
                FloorApiClient.body("Too deep", -51),
                FloorApiClient.body("Too high", 501),
                Map.of("name", "Text number", "number", "first"));

        for (var body : invalid) {
            var response = floorApi.create(adminToken, buildingId, body);

            assertThat(response.getStatusCode()).as(body.toString()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(code(response)).as(body.toString()).isEqualTo("VALIDATION_FAILED");
        }
        assertThat(names(floorApi.list(adminToken, buildingId))).isEmpty();
    }

    @Test
    @DisplayName("answers 404 when adding a floor to an unknown building")
    void create_unknownBuilding_returns404() {
        var response = floorApi.create(adminToken, UUID.randomUUID().toString(), FloorApiClient.body("Ground", 0));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(response)).isEqualTo("BUILDING_NOT_FOUND");
    }

    // --- update ---

    @Test
    @DisplayName("updates name and number, keeps the display position, and refuses another floor's number")
    void update_asAdmin_replacesFields() {
        String buildingId = createBuilding();
        String groundId = createFloor(buildingId, "Ground floor", 0);
        createFloor(buildingId, "First floor", 1);

        var renamed = floorApi.update(adminToken, buildingId, groundId, FloorApiClient.body("Lobby", 0));
        var renumbered = floorApi.update(adminToken, buildingId, groundId, FloorApiClient.body("Lobby", 5));
        var taken = floorApi.update(adminToken, buildingId, groundId, FloorApiClient.body("Lobby", 1));

        assertThat(renamed.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(renumbered.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(renumbered).get("number").asInt()).isEqualTo(5);
        assertThat(bodyOf(renumbered).get("sortOrder").asInt()).isZero();
        assertThat(taken.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(code(taken)).isEqualTo("FLOOR_NUMBER_ALREADY_IN_USE");
        assertThat(names(floorApi.list(adminToken, buildingId))).containsExactly("Lobby", "First floor");
    }

    @Test
    @DisplayName("answers 404 when updating an unknown floor")
    void update_unknown_returns404() {
        String buildingId = createBuilding();

        var response = floorApi.update(
                adminToken, buildingId, UUID.randomUUID().toString(), FloorApiClient.body("Ghost", 7));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(code(response)).isEqualTo("FLOOR_NOT_FOUND");
    }

    // --- reorder ---

    @Test
    @DisplayName("keeps a new order: every later read returns the floors in it")
    void reorder_asAdmin_isPersisted() {
        String buildingId = createBuilding();
        String ground = createFloor(buildingId, "Ground floor", 0);
        String first = createFloor(buildingId, "First floor", 1);
        String basement = createFloor(buildingId, "Basement", -1);

        var response = floorApi.reorder(adminToken, buildingId, FloorApiClient.order(List.of(first, ground, basement)));

        assertThat(names(response)).containsExactly("First floor", "Ground floor", "Basement");
        JsonNode body = bodyOf(response);
        assertThat(body.get(0).get("sortOrder").asInt()).isZero();
        assertThat(body.get(2).get("sortOrder").asInt()).isEqualTo(2);
        // "After reloading the page": a fresh read, by an employee too.
        assertThat(names(floorApi.list(employeeToken, buildingId)))
                .containsExactly("First floor", "Ground floor", "Basement");
    }

    @Test
    @DisplayName("rejects an order that misses a floor or names one of another building with 409")
    void reorder_outdatedList_returns409() {
        String buildingId = createBuilding();
        createFloor(buildingId, "Ground floor", 0);
        String first = createFloor(buildingId, "First floor", 1);
        String foreign = createFloor(createBuilding(), "Elsewhere", 0);

        var missing = floorApi.reorder(adminToken, buildingId, FloorApiClient.order(List.of(first)));
        var withForeign = floorApi.reorder(adminToken, buildingId, FloorApiClient.order(List.of(first, foreign)));

        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(code(missing)).isEqualTo("FLOOR_ORDER_OUTDATED");
        assertThat(withForeign.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(names(floorApi.list(adminToken, buildingId))).containsExactly("Ground floor", "First floor");
    }

    @Test
    @DisplayName("rejects an empty order, a repeated id and a non-UUID id with 400")
    void reorder_invalidBody_returns400() {
        String buildingId = createBuilding();
        String ground = createFloor(buildingId, "Ground floor", 0);

        var empty = floorApi.reorder(adminToken, buildingId, FloorApiClient.order(List.of()));
        var repeated = floorApi.reorder(adminToken, buildingId, FloorApiClient.order(List.of(ground, ground)));
        var notUuid = floorApi.reorder(adminToken, buildingId, FloorApiClient.order(List.of("abc")));

        assertThat(List.of(empty, repeated, notUuid)).allSatisfy(response -> {
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(code(response)).isEqualTo("VALIDATION_FAILED");
        });
    }

    // --- delete ---

    @Test
    @DisplayName("deletes a floor and leaves the others in their order")
    void delete_asAdmin_removesFloor() {
        String buildingId = createBuilding();
        createFloor(buildingId, "Ground floor", 0);
        String first = createFloor(buildingId, "First floor", 1);
        createFloor(buildingId, "Second floor", 2);

        var response = floorApi.delete(adminToken, buildingId, first);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(floorApi.getById(adminToken, buildingId, first).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(names(floorApi.list(adminToken, buildingId))).containsExactly("Ground floor", "Second floor");
    }

    @Test
    @DisplayName("answers 404 when deleting an unknown floor or one of another building")
    void delete_unknownOrForeign_returns404() {
        String buildingId = createBuilding();
        String foreign = createFloor(createBuilding(), "Elsewhere", 0);

        var unknown = floorApi.delete(adminToken, buildingId, UUID.randomUUID().toString());
        var other = floorApi.delete(adminToken, buildingId, foreign);

        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(other.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // --- building integration ---

    @Test
    @DisplayName("reports the real floor count on the building list and the single building")
    void building_floorCount_countsFloors() {
        String buildingId = createBuilding();
        createFloor(buildingId, "Ground floor", 0);
        createFloor(buildingId, "First floor", 1);

        JsonNode single = bodyOf(buildingApi.getById(employeeToken, buildingId));
        JsonNode listed = null;
        for (JsonNode building : bodyOf(buildingApi.list(employeeToken))) {
            if (building.get("id").asString().equals(buildingId)) {
                listed = building;
            }
        }

        assertThat(single.get("floorCount").asInt()).isEqualTo(2);
        assertThat(listed).isNotNull();
        assertThat(listed.get("floorCount").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("removes the floors of a deleted building")
    void deleteBuilding_removesItsFloors() {
        String buildingId = createBuilding();
        createFloor(buildingId, "Ground floor", 0);
        createFloor(buildingId, "First floor", 1);
        assertThat(floorRows(buildingId)).isEqualTo(2);

        assertThat(buildingApi.delete(adminToken, buildingId).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        assertThat(floorRows(buildingId)).isZero();
    }

    private Integer floorRows(String buildingId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM floors WHERE building_id = ?::uuid", Integer.class, buildingId);
    }
}
