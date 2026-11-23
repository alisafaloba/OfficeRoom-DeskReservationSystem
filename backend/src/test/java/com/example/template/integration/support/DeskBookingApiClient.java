package com.example.template.integration.support;

import java.util.HashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

/** HTTP-level access to the desk booking endpoint with bearer authentication. */
public class DeskBookingApiClient {

    private final TestRestTemplate restTemplate;

    public DeskBookingApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** A request body; {@code null} times are left out. */
    public static Map<String, Object> body(
            String resourceId, String date, String mode, @Nullable String startTime, @Nullable String endTime) {
        var body = new HashMap<String, Object>();
        body.put("resourceId", resourceId);
        body.put("date", date);
        body.put("mode", mode);
        if (startTime != null) {
            body.put("startTime", startTime);
        }
        if (endTime != null) {
            body.put("endTime", endTime);
        }
        return body;
    }

    public ResponseEntity<JsonNode> book(@Nullable String accessToken, Map<String, Object> body) {
        var headers = new HttpHeaders();
        if (accessToken != null) {
            headers.setBearerAuth(accessToken);
        }
        headers.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(
                "/api/v1/bookings/desk", HttpMethod.POST, new HttpEntity<>(body, headers), JsonNode.class);
    }
}
