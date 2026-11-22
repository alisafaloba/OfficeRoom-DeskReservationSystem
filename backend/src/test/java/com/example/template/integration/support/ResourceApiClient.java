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

/** HTTP-level access to the resource endpoints with bearer authentication. */
public class ResourceApiClient {

    private final TestRestTemplate restTemplate;

    public ResourceApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** A valid request body for a desk (mutable so tests can override fields). */
    public static Map<String, Object> deskBody(String name, @Nullable List<String> equipmentIds) {
        var body = new HashMap<String, Object>();
        body.put("name", name);
        body.put("type", "DESK");
        body.put("capacity", 1);
        body.put("notes", "");
        body.put("equipmentIds", equipmentIds == null ? List.of() : equipmentIds);
        return body;
    }

    /** A valid request body for a meeting room. */
    public static Map<String, Object> roomBody(String name, int capacity, @Nullable List<String> equipmentIds) {
        var body = new HashMap<String, Object>();
        body.put("name", name);
        body.put("type", "MEETING_ROOM");
        body.put("capacity", capacity);
        body.put("notes", "");
        body.put("equipmentIds", equipmentIds == null ? List.of() : equipmentIds);
        return body;
    }

    /** A minimal request body for any resource type (e.g. PHONE_BOOTH, PARKING_SPOT, BREAK_ROOM). */
    public static Map<String, Object> body(String name, String type) {
        return Map.of("name", name, "type", type);
    }

    public ResponseEntity<JsonNode> list(
            @Nullable String accessToken, String floorId, @Nullable String type, @Nullable String equipmentId) {
        StringBuilder path = new StringBuilder("/api/v1/floors/" + floorId + "/resources");
        if (type != null || equipmentId != null) {
            path.append("?");
            if (type != null) path.append("type=").append(type).append("&");
            if (equipmentId != null) path.append("equipmentId=").append(equipmentId);
        }
        return exchange(HttpMethod.GET, path.toString(), accessToken, null);
    }

    public ResponseEntity<JsonNode> getById(@Nullable String accessToken, String floorId, String resourceId) {
        return exchange(HttpMethod.GET, "/api/v1/floors/" + floorId + "/resources/" + resourceId, accessToken, null);
    }

    public ResponseEntity<JsonNode> create(@Nullable String accessToken, String floorId, Map<String, Object> body) {
        return exchange(HttpMethod.POST, "/api/v1/floors/" + floorId + "/resources", accessToken, body);
    }

    public ResponseEntity<JsonNode> update(
            @Nullable String accessToken, String floorId, String resourceId, Map<String, Object> body) {
        return exchange(
                HttpMethod.PUT, "/api/v1/floors/" + floorId + "/resources/" + resourceId, accessToken, body);
    }

    public ResponseEntity<JsonNode> delete(@Nullable String accessToken, String floorId, String resourceId) {
        return exchange(HttpMethod.DELETE, "/api/v1/floors/" + floorId + "/resources/" + resourceId, accessToken, null);
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