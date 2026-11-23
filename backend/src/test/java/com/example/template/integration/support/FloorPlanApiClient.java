package com.example.template.integration.support;

import java.util.HashMap;
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

/** HTTP-level access to GET/PUT /api/v1/floors/{id}/plan with bearer authentication. */
public class FloorPlanApiClient {

    private final TestRestTemplate restTemplate;

    public FloorPlanApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** A desk element, bound to {@code resourceId} unless it is null. */
    public static Map<String, Object> desk(String id, @Nullable String resourceId) {
        var element = new HashMap<String, Object>();
        element.put("id", id);
        element.put("type", "DESK");
        element.put("position", Map.of("x", 100, "y", 100));
        element.put("width", 140);
        element.put("height", 70);
        element.put("rotation", 0);
        if (resourceId != null) {
            element.put("resourceId", resourceId);
        }
        return element;
    }

    public static Map<String, Object> body(@Nullable Long version, List<Map<String, Object>> elements) {
        var body = new HashMap<String, Object>();
        body.put("version", version);
        body.put("schemaVersion", 1);
        body.put("elements", elements);
        return body;
    }

    public ResponseEntity<JsonNode> get(@Nullable String accessToken, String floorId) {
        return exchange(HttpMethod.GET, floorId, accessToken, null);
    }

    public ResponseEntity<JsonNode> save(@Nullable String accessToken, String floorId, Map<String, Object> body) {
        return exchange(HttpMethod.PUT, floorId, accessToken, body);
    }

    private ResponseEntity<JsonNode> exchange(
            HttpMethod method, String floorId, @Nullable String accessToken, @Nullable Map<String, Object> body) {
        var headers = new HttpHeaders();
        if (accessToken != null) {
            headers.setBearerAuth(accessToken);
        }
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        return restTemplate.exchange(
                "/api/v1/floors/" + floorId + "/plan", method, new HttpEntity<>(body, headers), JsonNode.class);
    }
}
