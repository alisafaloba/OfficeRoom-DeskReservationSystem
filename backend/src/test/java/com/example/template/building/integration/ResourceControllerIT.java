package com.example.template.building.integration;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.ResourceApiClient;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class ResourceControllerIT extends AbstractIntegrationTest {

    @Autowired
    private ResourceApiClient resourceApiClient;

    // Presupunem că ai acces și la acești clienți/repository-uri pentru a pregăti datele
    // @Autowired private BuildingApiClient buildingApiClient;
    // @Autowired private FloorApiClient floorApiClient;

    private String adminToken;
    private String userToken;
    private String testFloorId;

    @BeforeEach
    void setUp() {
        // Obținem token-urile (folosește clasa voastră de utilitare, de ex. TestUsers)
        // adminToken = TestUsers.getAdminToken();
        // userToken = TestUsers.getUserToken();

        adminToken = "mock-admin-token"; // Înlocuiește cu apelul real din proiectul vostru

        // Aici trebuie să creezi o clădire și un etaj pentru a respecta Foreign Key-ul.
        // Pentru exemplu, vom folosi un UUID arbitrar, dar în realitate vei face ceva de genul:
        // var buildingId = buildingApiClient.create(adminToken, BuildingApiClient.body("HQ", "UTC")).getBody().get("id").asText();
        // testFloorId = floorApiClient.create(adminToken, buildingId, ...).getBody().get("id").asText();

        testFloorId = UUID.randomUUID().toString();
    }

    @Test
    void shouldCreateAndListResources() {
        // 1. Admin creează un birou
        var deskBody = ResourceApiClient.deskBody("Desk 01", null);
        ResponseEntity<JsonNode> createResponse = resourceApiClient.create(adminToken, testFloorId, deskBody);

        assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(createResponse.getBody().get("label").asText()).isEqualTo("Desk 01");
        assertThat(createResponse.getBody().get("capacity").asInt()).isEqualTo(1);

        // 2. Un user normal (sau admin) poate lista resursele
        ResponseEntity<JsonNode> listResponse = resourceApiClient.list(adminToken, testFloorId, null, null);

        assertThat(listResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(listResponse.getBody().isArray()).isTrue();
        assertThat(listResponse.getBody().size()).isGreaterThanOrEqualTo(1);

        // Verificăm dacă biroul creat există în listă
        boolean found = false;
        for (JsonNode node : listResponse.getBody()) {
            if (node.get("label").asText().equals("Desk 01")) {
                found = true;
                break;
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void shouldFilterResourcesByTypeAndEquipment() {
        // ID-ul unui echipament (ex: monitor) din scriptul Liquibase
        String monitorId = "11111111-1111-1111-1111-111111111111";

        // Creăm un birou cu monitor
        resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Desk Filtered", List.of(monitorId)));

        // Creăm o sală de ședințe fără monitor
        resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.roomBody("Room Filtered", 5, null));

        // Filtrăm doar după tip = DESK
        var typeResponse = resourceApiClient.list(adminToken, testFloorId, "DESK", null);
        assertThat(typeResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        for (JsonNode node : typeResponse.getBody()) {
            assertThat(node.get("type").asText()).isEqualTo("DESK");
        }

        // Filtrăm după echipament = Monitor
        var eqResponse = resourceApiClient.list(adminToken, testFloorId, null, monitorId);
        assertThat(eqResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        for (JsonNode node : eqResponse.getBody()) {
            // Ne asigurăm că resursa returnată are monitorul în lista de echipamente
            boolean hasMonitor = false;
            for (JsonNode eq : node.get("equipment")) {
                if (eq.get("id").asText().equals(monitorId)) {
                    hasMonitor = true;
                    break;
                }
            }
            assertThat(hasMonitor).isTrue();
        }
    }

    @Test
    void shouldRejectDuplicateLabelsOnSameFloor() {
        // Creăm o resursă
        resourceApiClient.create(adminToken, testFloorId, ResourceApiClient.deskBody("Unique Label", null));

        // Încercăm să creăm o a doua resursă cu ACELAȘI label
        ResponseEntity<JsonNode> duplicateResponse = resourceApiClient.create(
                adminToken, testFloorId, ResourceApiClient.roomBody("Unique Label", 4, null)
        );

        // API-ul trebuie să returneze 400 Bad Request
        assertThat(duplicateResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldEnforceCapacityRules() {
        // Birou cu capacitate > 1 (Invalid)
        var invalidDesk = ResourceApiClient.deskBody("Bad Desk", null);
        invalidDesk.put("capacity", 2); // Suprascriem capacitatea cu una invalidă

        ResponseEntity<JsonNode> deskResponse = resourceApiClient.create(adminToken, testFloorId, invalidDesk);
        assertThat(deskResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // Sală de ședințe cu capacitate < 1 (Invalid)
        var invalidRoom = ResourceApiClient.roomBody("Bad Room", 0, null);

        ResponseEntity<JsonNode> roomResponse = resourceApiClient.create(adminToken, testFloorId, invalidRoom);
        assertThat(roomResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}