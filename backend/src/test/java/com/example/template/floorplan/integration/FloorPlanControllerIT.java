package com.example.template.floorplan.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.FloorPlanApiClient;
import com.example.template.integration.support.ResourceApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

@DataSet("datasets/floor-users.yml")
class FloorPlanControllerIT extends AbstractIntegrationTest {

    private FloorPlanApiClient planApi;
    private ResourceApiClient resourceApi;
    private FloorApiClient floorApi;
    private String adminToken;
    private String employeeToken;
    private String buildingId;
    private String floorId;

    @BeforeEach
    void setUp() {
        planApi = new FloorPlanApiClient(restTemplate);
        resourceApi = new ResourceApiClient(restTemplate);
        floorApi = new FloorApiClient(restTemplate);
        var buildingApi = new BuildingApiClient(restTemplate);
        var authApi = new AuthApiClient(restTemplate);
        adminToken = authApi.accessTokenFor(TestUsers.FLOOR_ADMIN_EMAIL, TestUsers.PASSWORD);
        employeeToken = authApi.accessTokenFor(TestUsers.FLOOR_EMPLOYEE_EMAIL, TestUsers.PASSWORD);
        buildingId = bodyOf(buildingApi.create(
                        adminToken, BuildingApiClient.body("Plan HQ " + UUID.randomUUID(), "Europe/Bucharest")))
                .get("id")
                .asString();
        floorId = newFloor(1);
    }

    private String newFloor(int number) {
        return bodyOf(floorApi.create(adminToken, buildingId, FloorApiClient.body("Floor " + number, number)))
                .get("id")
                .asString();
    }

    private String newDesk(String onFloor, String name) {
        return bodyOf(resourceApi.create(adminToken, onFloor, ResourceApiClient.deskBody(name, null)))
                .get("id")
                .asString();
    }

    @Test
    void aFloorWithoutPlanLoadsEmpty() {
        var response = planApi.get(employeeToken, floorId);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(response).get("version").isNull()).isTrue();
        assertThat(bodyOf(response).get("elements").size()).isZero();
    }

    @Test
    void savedBindingsReloadExactly() {
        String deskId = newDesk(floorId, "Desk A");
        var saved = planApi.save(
                adminToken,
                floorId,
                FloorPlanApiClient.body(
                        null, List.of(FloorPlanApiClient.desk("d1", deskId), FloorPlanApiClient.desk("d2", null))));
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);

        JsonNode loaded = bodyOf(planApi.get(employeeToken, floorId));
        assertThat(loaded.get("version").asLong()).isEqualTo(bodyOf(saved).get("version").asLong());
        assertThat(loaded.get("elements").get(0).get("resourceId").asString()).isEqualTo(deskId);
        assertThat(loaded.get("elements").get(1).has("resourceId")).isFalse();
    }

    @Test
    void theSameResourceOnTwoShapesIsRejected() {
        String deskId = newDesk(floorId, "Desk B");
        var response = planApi.save(
                adminToken,
                floorId,
                FloorPlanApiClient.body(
                        null, List.of(FloorPlanApiClient.desk("d1", deskId), FloorPlanApiClient.desk("d2", deskId))));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("FLOOR_PLAN_RESOURCE_ALREADY_PLACED");
    }

    @Test
    void aResourceFromAnotherFloorIsRejected() {
        String otherDesk = newDesk(newFloor(2), "Desk C");
        var response = planApi.save(
                adminToken, floorId, FloorPlanApiClient.body(null, List.of(FloorPlanApiClient.desk("d1", otherDesk))));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("FLOOR_PLAN_RESOURCE_INVALID");
    }

    @Test
    void anOutdatedSaveIsRejectedAndOverwritesNothing() {
        long first = bodyOf(planApi.save(adminToken, floorId, FloorPlanApiClient.body(null, List.of())))
                .get("version")
                .asLong();
        planApi.save(adminToken, floorId, FloorPlanApiClient.body(first, List.of(FloorPlanApiClient.desk("d1", null))));

        var stale = planApi.save(adminToken, floorId, FloorPlanApiClient.body(first, List.of()));

        assertThat(stale.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(bodyOf(stale).get("code").asString()).isEqualTo("FLOOR_PLAN_OUTDATED");
        assertThat(bodyOf(planApi.get(adminToken, floorId)).get("elements").size()).isEqualTo(1);
    }

    @Test
    void deletingABoundResourceLeavesTheShapeUnbound() {
        String deskId = newDesk(floorId, "Desk D");
        planApi.save(adminToken, floorId, FloorPlanApiClient.body(null, List.of(FloorPlanApiClient.desk("d1", deskId))));
        resourceApi.delete(adminToken, floorId, deskId);

        JsonNode element = bodyOf(planApi.get(adminToken, floorId)).get("elements").get(0);

        assertThat(element.get("id").asString()).isEqualTo("d1");
        assertThat(element.has("resourceId")).isFalse();
    }

    @Test
    void employeesCannotSave() {
        var response = planApi.save(employeeToken, floorId, FloorPlanApiClient.body(null, List.of()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
}
