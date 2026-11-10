package com.example.template.integration.support;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

/** HTTP-level access to the floor endpoints of a building with bearer authentication. */
public class FloorApiClient {

    private final TestRestTemplate restTemplate;

    public FloorApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** A valid create or update body. */
    public static Map<String, Object> body(String name, int number) {
        return Map.of("name", name, "number", number);
    }

    /** A reorder body: the floor ids first to last. */
    public static Map<String, Object> order(List<String> floorIds) {
        return Map.of("floorIds", floorIds);
    }

    public ResponseEntity<JsonNode> list(@Nullable String accessToken, String buildingId) {
        return exchange(HttpMethod.GET, floors(buildingId), accessToken, null);
    }

    public ResponseEntity<JsonNode> getById(@Nullable String accessToken, String buildingId, String floorId) {
        return exchange(HttpMethod.GET, floors(buildingId) + "/" + floorId, accessToken, null);
    }

    public ResponseEntity<JsonNode> create(@Nullable String accessToken, String buildingId, Map<String, Object> body) {
        return exchange(HttpMethod.POST, floors(buildingId), accessToken, body);
    }

    public ResponseEntity<JsonNode> update(
            @Nullable String accessToken, String buildingId, String floorId, Map<String, Object> body) {
        return exchange(HttpMethod.PUT, floors(buildingId) + "/" + floorId, accessToken, body);
    }

    public ResponseEntity<JsonNode> delete(@Nullable String accessToken, String buildingId, String floorId) {
        return exchange(HttpMethod.DELETE, floors(buildingId) + "/" + floorId, accessToken, null);
    }

    public ResponseEntity<JsonNode> reorder(
            @Nullable String accessToken, String buildingId, Map<String, Object> body) {
        return exchange(HttpMethod.PUT, floors(buildingId) + "/order", accessToken, body);
    }

    private static String floors(String buildingId) {
        return "/api/v1/buildings/" + buildingId + "/floors";
    }

    private ResponseEntity<JsonNode> exchange(
            HttpMethod method, String path, @Nullable String accessToken, @Nullable Map<String, Object> body) {
        var headers = new HttpHeaders();
        if (accessToken != null) {
            headers.setBearerAuth(accessToken);
        }
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }
}
