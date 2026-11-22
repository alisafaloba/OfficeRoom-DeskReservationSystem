package com.example.template.resource.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.ResourceApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

@DataSet("datasets/floor-users.yml")
class ResourceControllerIT extends AbstractIntegrationTest {

    private ResourceApiClient resourceApiClient;
    private BuildingApiClient buildingApiClient;
    private FloorApiClient floorApiClient;
    private AuthApiClient authApiClient;

    private String adminToken;
    private String testFloorId;

    @BeforeEach
    void setUp() {
        resourceApiClient = new ResourceApiClient(restTemplate);
        buildingApiClient = new BuildingApiClient(restTemplate);
        floorApiClient = new FloorApiClient(restTemplate);
        authApiClient = new AuthApiClient(restTemplate);

        adminToken = authApiClient.accessTokenFor(TestUsers.FLOOR_ADMIN_EMAIL, TestUsers.PASSWORD);

        var buildingBody = BuildingApiClient.body("HQ Test " + UUID.randomUUID(), "Europe/Bucharest");
        String buildingId = bodyOf(buildingApiClient.create(adminToken, buildingBody)).get("id").asString();

        var floorBody = FloorApiClient.body("Floor 1", 1);
        testFloorId = bodyOf(floorApiClient.create(adminToken, buildingId, floorBody)).get("id").asString();
    }

    @Test
    void shouldCreateAndListResources() {
        var deskBody = ResourceApiClient.deskBody("Desk 01", null);
        ResponseEntity<JsonNode> createResponse = resourceApiClient.create(adminToken, testFloorId, deskBody);

        assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode created = bodyOf(createResponse);
        assertThat(created.get("name").asString()).isEqualTo("Desk 01");
        assertThat(created.get("capacity").asInt()).isEqualTo(1);
        assertThat(created.get("bookable").asBoolean()).isTrue();

        ResponseEntity<JsonNode> listResponse = resourceApiClient.list(adminToken, testFloorId, null, null);
        assertThat(listResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode list = bodyOf(listResponse);
        assertThat(list.isArray()).isTrue();
        assertThat(list.size()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void shouldSupportNewAreaTypesAndBookableFlag() {
        var boothRes = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.body("Booth 1", "PHONE_BOOTH"));
        var breakRes = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.body("Kitchen", "BREAK_ROOM"));

        assertThat(boothRes.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(bodyOf(boothRes).get("bookable").asBoolean()).isTrue();

        assertThat(breakRes.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(bodyOf(breakRes).get("bookable").asBoolean()).isFalse();
    }

    @Test
    void shouldFilterResourcesByTypeAndEquipment() {
        String monitorId = "11111111-1111-1111-1111-111111111111";

        resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Desk Filtered", List.of(monitorId)));
        resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.roomBody("Room Filtered", 5, null));

        var typeResponse = resourceApiClient.list(adminToken, testFloorId, "DESK", null);
        assertThat(typeResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode byType = bodyOf(typeResponse);
        assertThat(byType.size()).isEqualTo(1);
        assertThat(byType.get(0).get("type").asString()).isEqualTo("DESK");

        var eqResponse = resourceApiClient.list(adminToken, testFloorId, null, monitorId);
        assertThat(eqResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode byEq = bodyOf(eqResponse);
        assertThat(byEq.size()).isEqualTo(1);
        assertThat(byEq.get(0).get("equipment").get(0).get("id").asString()).isEqualTo(monitorId);
    }

    @Test
    void shouldRejectDuplicateNamesOnSameFloor() {
        resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Unique Name", null));

        ResponseEntity<JsonNode> duplicateResponse = resourceApiClient.create(
                adminToken, testFloorId, ResourceApiClient.roomBody("Unique Name", 4, null));

        assertThat(duplicateResponse.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void shouldEnforceCapacityRules() {
        var invalidDesk = ResourceApiClient.deskBody("Bad Desk", null);
        invalidDesk.put("capacity", 2);
        assertThat(resourceApiClient.create(adminToken, testFloorId, invalidDesk).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        var invalidRoom = ResourceApiClient.roomBody("Bad Room", 0, null);
        assertThat(resourceApiClient.create(adminToken, testFloorId, invalidRoom).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}