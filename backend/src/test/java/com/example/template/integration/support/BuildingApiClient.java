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

/** HTTP-level access to the building endpoints with bearer authentication. */
public class BuildingApiClient {

    private static final List<String> WEEK =
            List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY");

    private final TestRestTemplate restTemplate;

    public BuildingApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** A valid request body: open 08:00–18:00 on weekdays, closed on the weekend. */
    public static Map<String, Object> body(String name, String timeZone) {
        return Map.of("name", name, "address", "1 Main Street", "timeZone", timeZone, "openingHours", defaultWeek());
    }

    public static List<Map<String, Object>> defaultWeek() {
        return WEEK.stream()
                .<Map<String, Object>>map(day -> day.startsWith("S")
                        ? Map.of("dayOfWeek", day)
                        : Map.of("dayOfWeek", day, "opensAt", "08:00", "closesAt", "18:00"))
                .toList();
    }

    public ResponseEntity<JsonNode> list(@Nullable String accessToken) {
        return exchange(HttpMethod.GET, "/api/v1/buildings", accessToken, null);
    }

    public ResponseEntity<JsonNode> getById(@Nullable String accessToken, String id) {
        return exchange(HttpMethod.GET, "/api/v1/buildings/" + id, accessToken, null);
    }

    public ResponseEntity<JsonNode> create(@Nullable String accessToken, Map<String, Object> body) {
        return exchange(HttpMethod.POST, "/api/v1/buildings", accessToken, body);
    }

    public ResponseEntity<JsonNode> update(@Nullable String accessToken, String id, Map<String, Object> body) {
        return exchange(HttpMethod.PUT, "/api/v1/buildings/" + id, accessToken, body);
    }

    public ResponseEntity<JsonNode> delete(@Nullable String accessToken, String id) {
        return exchange(HttpMethod.DELETE, "/api/v1/buildings/" + id, accessToken, null);
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
