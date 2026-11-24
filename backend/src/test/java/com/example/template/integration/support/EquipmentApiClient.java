package com.example.template.integration.support;

import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

/** HTTP-level access to the equipment catalogue endpoints with bearer authentication. */
public class EquipmentApiClient {

    private final TestRestTemplate restTemplate;

    public EquipmentApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public static Map<String, Object> body(String name) {
        return Map.of("name", name);
    }

    public ResponseEntity<JsonNode> list(@Nullable String accessToken) {
        return exchange(HttpMethod.GET, "/api/v1/equipment", accessToken, null);
    }

    public ResponseEntity<JsonNode> create(@Nullable String accessToken, Map<String, Object> body) {
        return exchange(HttpMethod.POST, "/api/v1/equipment", accessToken, body);
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
