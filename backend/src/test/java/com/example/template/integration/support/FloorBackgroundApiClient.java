package com.example.template.integration.support;

import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import tools.jackson.databind.JsonNode;

/** HTTP-level access to a floor's background image with bearer authentication. */
public class FloorBackgroundApiClient {

    /** The smallest byte sequence the server recognises as a PNG (signature plus one byte). */
    public static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0};

    private final TestRestTemplate restTemplate;

    public FloorBackgroundApiClient(TestRestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /** A valid settings body. */
    public static Map<String, Object> settings(int opacity, double cmPerPixel) {
        return Map.of("opacity", opacity, "cmPerPixel", cmPerPixel);
    }

    /** Sends {@code content} as the multipart field {@code file}, under the given file name. */
    public ResponseEntity<JsonNode> upload(
            @Nullable String accessToken, String floorId, byte[] content, String fileName) {
        var part = new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return fileName;
            }
        };
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", part);
        var headers = headers(accessToken);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return restTemplate.exchange(
                background(floorId), HttpMethod.PUT, new HttpEntity<>(form, headers), JsonNode.class);
    }

    public ResponseEntity<JsonNode> get(@Nullable String accessToken, String floorId) {
        return exchange(HttpMethod.GET, background(floorId), accessToken, null);
    }

    public ResponseEntity<byte[]> image(@Nullable String accessToken, String floorId) {
        return restTemplate.exchange(
                background(floorId) + "/image", HttpMethod.GET, new HttpEntity<>(headers(accessToken)), byte[].class);
    }

    public ResponseEntity<JsonNode> updateSettings(
            @Nullable String accessToken, String floorId, Map<String, Object> body) {
        return exchange(HttpMethod.PATCH, background(floorId), accessToken, body);
    }

    public ResponseEntity<JsonNode> delete(@Nullable String accessToken, String floorId) {
        return exchange(HttpMethod.DELETE, background(floorId), accessToken, null);
    }

    private static String background(String floorId) {
        return "/api/v1/floors/" + floorId + "/background";
    }

    private static HttpHeaders headers(@Nullable String accessToken) {
        var headers = new HttpHeaders();
        if (accessToken != null) {
            headers.setBearerAuth(accessToken);
        }
        return headers;
    }

    private ResponseEntity<JsonNode> exchange(
            HttpMethod method, String path, @Nullable String accessToken, @Nullable Map<String, Object> body) {
        var headers = headers(accessToken);
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }
}
