package com.example.template.resource.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.EquipmentApiClient;
import com.example.template.integration.support.TestUsers;
import com.github.database.rider.core.api.dataset.DataSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

@DataSet("datasets/floor-users.yml")
class EquipmentControllerIT extends AbstractIntegrationTest {

    private EquipmentApiClient equipmentApiClient;
    private AuthApiClient authApiClient;

    private String adminToken;
    private String userToken;

    @BeforeEach
    void setUp() {
        equipmentApiClient = new EquipmentApiClient(restTemplate);
        authApiClient = new AuthApiClient(restTemplate);

        adminToken = authApiClient.accessTokenFor(TestUsers.FLOOR_ADMIN_EMAIL, TestUsers.PASSWORD);
        userToken = authApiClient.accessTokenFor(TestUsers.FLOOR_EMPLOYEE_EMAIL, TestUsers.PASSWORD);
    }

    @Test
    void shouldListSeededEquipmentForAnyAuthenticatedUser() {
        ResponseEntity<JsonNode> response = equipmentApiClient.list(userToken);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode list = bodyOf(response);
        assertThat(list.isArray()).isTrue();
        assertThat(list.size()).isGreaterThanOrEqualTo(5);

        // Verify seeded items are present
        boolean hasMonitor = false;
        for (JsonNode item : list) {
            if ("monitor".equals(item.get("name").asString())) {
                hasMonitor = true;
                break;
            }
        }
        assertThat(hasMonitor).isTrue();
    }

    @Test
    void shouldAllowAdminToAddNewEquipment() {
        String newName = "Dual 4K Displays " + System.currentTimeMillis();
        var body = EquipmentApiClient.body(newName);

        ResponseEntity<JsonNode> createResponse = equipmentApiClient.create(adminToken, body);
        assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode created = bodyOf(createResponse);
        assertThat(created.get("name").asString()).isEqualTo(newName);
        assertThat(created.get("id").asString()).isNotBlank();

        // Check it appears in the list
        ResponseEntity<JsonNode> listResponse = equipmentApiClient.list(adminToken);
        assertThat(listResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode list = bodyOf(listResponse);
        boolean found = false;
        for (JsonNode item : list) {
            if (newName.equals(item.get("name").asString())) {
                found = true;
                break;
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void shouldForbidNonAdminFromAddingEquipment() {
        var body = EquipmentApiClient.body("Ergonomic Keyboard");
        ResponseEntity<JsonNode> response = equipmentApiClient.create(userToken, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void shouldRejectDuplicateEquipmentName() {
        var body = EquipmentApiClient.body("monitor");
        ResponseEntity<JsonNode> response = equipmentApiClient.create(adminToken, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
}
