package com.example.template.integration.support;

import org.jspecify.annotations.Nullable;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

/** HTTP-level access to the floor availability endpoint with bearer authentication. */
public class AvailabilityApiClient {

    private final TestRestTemplate restTemplate;

    public AvailabilityApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** {@code from} and {@code to} go out as given; {@code null} leaves the parameter out. */
    public ResponseEntity<JsonNode> forFloor(
            @Nullable String accessToken, String floorId, @Nullable String from, @Nullable String to) {
        var uri = UriComponentsBuilder.fromPath("/api/v1/floors/{floorId}/availability");
        if (from != null) {
            uri.queryParam("from", from);
        }
        if (to != null) {
            uri.queryParam("to", to);
        }
        var headers = new HttpHeaders();
        if (accessToken != null) {
            headers.setBearerAuth(accessToken);
        }
        return restTemplate.exchange(
                uri.buildAndExpand(floorId).toUriString(), HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
    }
}
