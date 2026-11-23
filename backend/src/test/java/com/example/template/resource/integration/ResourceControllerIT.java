package com.example.template.resource.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.dto.BookingType;
import com.example.template.booking.model.Booking;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.ResourceApiClient;
import com.example.template.integration.support.TestUsers;
import com.example.template.user.repository.UserRepository;
import com.github.database.rider.core.api.dataset.DataSet;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

@DataSet("datasets/floor-users.yml")
class ResourceControllerIT extends AbstractIntegrationTest {

    @Autowired
    private BookingRepository bookingRepository;

    @Autowired
    private UserRepository userRepository;

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
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("name").asString()).isEqualTo("Desk 01");
    }

    @Test
    void shouldUpdateResourceAndEnforceNameUniqueness() {
        var createA = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Desk A", null));
        var createB = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Desk B", null));
        String idA = bodyOf(createA).get("id").asString();
        String idB = bodyOf(createB).get("id").asString();

        // 1. Rename to same name as Desk B -> 409 Conflict
        var conflictBody = ResourceApiClient.deskBody("Desk B", null);
        var conflictRes = resourceApiClient.update(adminToken, testFloorId, idA, conflictBody);
        assertThat(conflictRes.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

        // 2. Successful update changing name, type, and equipment
        String monitorId = "11111111-1111-1111-1111-111111111111";
        var updateBody = ResourceApiClient.roomBody("Boardroom 1", 8, List.of(monitorId));
        var updateRes = resourceApiClient.update(adminToken, testFloorId, idA, updateBody);
        assertThat(updateRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode updated = bodyOf(updateRes);
        assertThat(updated.get("name").asString()).isEqualTo("Boardroom 1");
        assertThat(updated.get("type").asString()).isEqualTo("MEETING_ROOM");
        assertThat(updated.get("capacity").asInt()).isEqualTo(8);
        assertThat(updated.get("equipment")).hasSize(1);
        assertThat(updated.get("equipment").get(0).get("id").asString()).isEqualTo(monitorId);
    }

    @Test
    void shouldDeleteResourceWith204() {
        var createRes = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("To Delete", null));
        String resourceId = bodyOf(createRes).get("id").asString();

        var deleteRes = resourceApiClient.delete(adminToken, testFloorId, resourceId);
        assertThat(deleteRes.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        var getRes = resourceApiClient.getById(adminToken, testFloorId, resourceId);
        assertThat(getRes.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void shouldRejectDeleteWhenFutureBookingsExist() {
        var createRes = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Desk With Booking", null));
        UUID resourceId = UUID.fromString(bodyOf(createRes).get("id").asString());
        UUID userId = userRepository.findByEmail(TestUsers.FLOOR_ADMIN_EMAIL).orElseThrow().requireId();

        // 1. Create a future booking ending tomorrow
        Instant now = Instant.now();
        var booking = new Booking(resourceId, userId, BookingType.DESK, now.plus(1, ChronoUnit.HOURS), now.plus(2, ChronoUnit.HOURS));
        bookingRepository.saveAndFlush(booking);

        // Delete must return 409 Conflict
        var deleteRes = resourceApiClient.delete(adminToken, testFloorId, resourceId.toString());
        assertThat(deleteRes.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(bodyOf(deleteRes).get("code").asString()).isEqualTo("RESOURCE_HAS_FUTURE_BOOKINGS");

        // 2. Mark booking as CANCELLED -> delete succeeds with 204
        booking.setStatus(BookingStatus.CANCELLED);
        bookingRepository.saveAndFlush(booking);

        var successDelete = resourceApiClient.delete(adminToken, testFloorId, resourceId.toString());
        assertThat(successDelete.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void shouldAllowSameResourceNameOnDifferentFloors() {
        var buildingBody = BuildingApiClient.body("HQ Floor Test " + UUID.randomUUID(), "Europe/Bucharest");
        String bId = bodyOf(buildingApiClient.create(adminToken, buildingBody)).get("id").asString();
        String floor1 = bodyOf(floorApiClient.create(adminToken, bId, FloorApiClient.body("Floor 1", 1))).get("id").asString();
        String floor2 = bodyOf(floorApiClient.create(adminToken, bId, FloorApiClient.body("Floor 2", 2))).get("id").asString();

        var res1 = resourceApiClient.create(adminToken, floor1, ResourceApiClient.deskBody("Desk 101", null));
        var res2 = resourceApiClient.create(adminToken, floor2, ResourceApiClient.deskBody("Desk 101", null));

        assertThat(res1.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(res2.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldEnforceNonAdminForbiddenOnMutationsAndAllowRead() {
        String employeeToken = authApiClient.accessTokenFor(TestUsers.FLOOR_EMPLOYEE_EMAIL, TestUsers.PASSWORD);

        // Employee can list
        var listRes = resourceApiClient.list(employeeToken, testFloorId, null, null);
        assertThat(listRes.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Employee cannot create
        var createRes = resourceApiClient.create(employeeToken, testFloorId, ResourceApiClient.deskBody("Forbidden Desk", null));
        assertThat(createRes.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        // Create an item as admin to test update and delete permissions
        var adminCreate = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Admin Item", null));
        String resId = bodyOf(adminCreate).get("id").asString();

        // Employee cannot update
        var updateRes = resourceApiClient.update(employeeToken, testFloorId, resId, ResourceApiClient.deskBody("Hacked Name", null));
        assertThat(updateRes.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        // Employee cannot delete
        var deleteRes = resourceApiClient.delete(employeeToken, testFloorId, resId);
        assertThat(deleteRes.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void shouldRejectUnknownEquipmentIdWith400() {
        UUID unknownId = UUID.randomUUID();
        var body = ResourceApiClient.deskBody("Desk Missing Eq", List.of(unknownId.toString()));
        var response = resourceApiClient.create(adminToken, testFloorId, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response).get("code").asString()).isEqualTo("EQUIPMENT_NOT_FOUND");
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

        // Case-insensitive duplicate test: "unique name"
        ResponseEntity<JsonNode> duplicateResponse = resourceApiClient.create(
                adminToken, testFloorId, ResourceApiClient.roomBody("unique name", 4, null));

        assertThat(duplicateResponse.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void shouldEnforceCapacityRules() {
        var invalidDesk = ResourceApiClient.deskBody("Bad Desk", null);
        invalidDesk.put("capacity", 2);
        assertThat(resourceApiClient.create(adminToken, testFloorId, invalidDesk).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        var invalidRoomZero = ResourceApiClient.roomBody("Bad Room Zero", 0, null);
        assertThat(resourceApiClient.create(adminToken, testFloorId, invalidRoomZero).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        var invalidRoomNull = ResourceApiClient.deskBody("Bad Room Null", null);
        invalidRoomNull.put("type", "MEETING_ROOM");
        invalidRoomNull.put("capacity", null);
        assertThat(resourceApiClient.create(adminToken, testFloorId, invalidRoomNull).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldChangeResourceStatusAndEnforceAdminAccess() {
        var createResponse = resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Desk Status Test", null));
        String resourceId = bodyOf(createResponse).get("id").asString();

        // 1. Admin changes status to MAINTENANCE with reason
        var maintenanceBody = Map.<String, Object>of("status", "MAINTENANCE", "reason", "Repairs underway");
        var statusResponse = resourceApiClient.changeStatus(adminToken, testFloorId, resourceId, maintenanceBody);
        assertThat(statusResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode updated = bodyOf(statusResponse);
        assertThat(updated.get("status").asString()).isEqualTo("MAINTENANCE");
        assertThat(updated.get("statusReason").asString()).isEqualTo("Repairs underway");

        // 2. Non-admin is forbidden from changing status
        String userToken = authApiClient.accessTokenFor(TestUsers.FLOOR_EMPLOYEE_EMAIL, TestUsers.PASSWORD);
        var forbiddenResponse = resourceApiClient.changeStatus(userToken, testFloorId, resourceId, Map.of("status", "AVAILABLE"));
        assertThat(forbiddenResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        // 3. Admin restores status to AVAILABLE
        var availableResponse = resourceApiClient.changeStatus(adminToken, testFloorId, resourceId, Map.of("status", "AVAILABLE"));
        assertThat(availableResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bodyOf(availableResponse).get("status").asString()).isEqualTo("AVAILABLE");
        assertThat(bodyOf(availableResponse).get("statusReason").isNull()).isTrue();
    }
}