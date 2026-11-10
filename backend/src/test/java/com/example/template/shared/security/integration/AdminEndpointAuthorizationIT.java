package com.example.template.shared.security.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.BuildingApiClient;
import com.example.template.integration.support.FloorApiClient;
import com.example.template.integration.support.TestUsers;
import com.example.template.integration.support.UserApiClient;
import com.example.template.shared.security.Role;
import com.example.template.shared.security.TokenType;
import com.github.database.rider.core.api.dataset.DataSet;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

/**
 * The role rule of every admin endpoint, end to end: employees get 403, callers without a valid
 * token get 401 — both as RFC 9457 ProblemDetail — and admins pass the check. A new admin
 * endpoint only needs an entry in {@link #adminEndpoints()}.
 *
 * <p>Requests carry valid bodies on purpose: {@code @Valid} runs before {@code @PreAuthorize},
 * so an invalid body would answer 400 and hide the authorization result. Admin calls target
 * unknown ids or a taken e-mail, so they pass authorization without changing any data.
 *
 * <p>No {@code @Nested} groups — see UserControllerIT for the database-rider reason.
 */
@DataSet("datasets/admin-authorization-users.yml")
@DisplayName("Admin endpoint authorization")
class AdminEndpointAuthorizationIT extends AbstractIntegrationTest {

    /** Outlives the configured clock skew (60s) by a wide margin. */
    private static final Duration EXPIRED_FOR = Duration.ofHours(1);

    @Value("${app.security.jwt.secret}")
    private String jwtSecret;

    private AuthApiClient authApi;
    private Clients clients;

    /** Every API client an admin endpoint may need. */
    record Clients(UserApiClient users, BuildingApiClient buildings, FloorApiClient floors) {}

    /**
     * One admin endpoint: how to call it, and the status an admin gets for that call.
     */
    record AdminEndpoint(
            String name, BiFunction<Clients, String, ResponseEntity<JsonNode>> call, HttpStatus adminStatus) {

        ResponseEntity<JsonNode> callWith(Clients clients, String accessToken) {
            return call.apply(clients, accessToken);
        }

        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<AdminEndpoint> adminEndpoints() {
        String unknownId = UUID.randomUUID().toString();
        return Stream.of(
                new AdminEndpoint("GET /users", (c, token) -> c.users().list(token), HttpStatus.OK),
                new AdminEndpoint(
                        "POST /users",
                        (c, token) -> c.users().create(
                                token, TestUsers.AUTHZ_EMPLOYEE_EMAIL, "valid-password-123", Role.USER.name()),
                        HttpStatus.CONFLICT),
                new AdminEndpoint(
                        "PUT /users/{id}",
                        (c, token) -> c.users().update(
                                token, unknownId, "someone@test.local", Role.USER.name(), null),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "DELETE /users/{id}", (c, token) -> c.users().delete(token, unknownId), HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "POST /buildings",
                        (c, token) -> c.buildings().create(token, BuildingApiClient.body(
                                "Authorization check " + UUID.randomUUID(), "UTC")),
                        HttpStatus.CREATED),
                new AdminEndpoint(
                        "PUT /buildings/{id}",
                        (c, token) -> c.buildings().update(token, unknownId, BuildingApiClient.body(
                                "Authorization check " + UUID.randomUUID(), "UTC")),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "DELETE /buildings/{id}",
                        (c, token) -> c.buildings().delete(token, unknownId),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "POST /buildings/{id}/floors",
                        (c, token) -> c.floors().create(token, unknownId, FloorApiClient.body("Ground", 0)),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "PUT /buildings/{id}/floors/{floorId}",
                        (c, token) -> c.floors().update(token, unknownId, unknownId, FloorApiClient.body("Ground", 0)),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "PUT /buildings/{id}/floors/order",
                        (c, token) -> c.floors().reorder(token, unknownId, FloorApiClient.order(List.of(unknownId))),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "DELETE /buildings/{id}/floors/{floorId}",
                        (c, token) -> c.floors().delete(token, unknownId, unknownId),
                        HttpStatus.NOT_FOUND));
    }

    @BeforeEach
    void setUp() {
        authApi = new AuthApiClient(restTemplate);
        clients = new Clients(
                new UserApiClient(restTemplate), new BuildingApiClient(restTemplate), new FloorApiClient(restTemplate));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("denies an employee with 403 FORBIDDEN as ProblemDetail")
    void adminEndpoint_asEmployee_returns403Problem(AdminEndpoint endpoint) {
        String token = authApi.accessTokenFor(TestUsers.AUTHZ_EMPLOYEE_EMAIL, TestUsers.PASSWORD);

        var response = endpoint.callWith(clients, token);

        assertProblem(response, HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail without a token")
    void adminEndpoint_withoutToken_returns401Problem(AdminEndpoint endpoint) {
        var response = endpoint.callWith(clients, null);

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail for a malformed token")
    void adminEndpoint_malformedToken_returns401Problem(AdminEndpoint endpoint) {
        var response = endpoint.callWith(clients, "not-a-jwt");

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail for an admin token with a tampered signature")
    void adminEndpoint_tamperedAdminToken_returns401Problem(AdminEndpoint endpoint) {
        String token = authApi.accessTokenFor(TestUsers.AUTHZ_ADMIN_EMAIL, TestUsers.PASSWORD);

        var response = endpoint.callWith(clients, tamperSignature(token));

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail for an expired admin token")
    void adminEndpoint_expiredAdminToken_returns401Problem(AdminEndpoint endpoint) {
        String token = adminAccessTokenExpiringAt(Instant.now().minus(EXPIRED_FOR));

        var response = endpoint.callWith(clients, token);

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @Test
    @DisplayName("accepts the self-signed admin token while it is valid — guards the expired-token test")
    void selfSignedAdminToken_notExpired_isAccepted() {
        String token = adminAccessTokenExpiringAt(Instant.now().plus(Duration.ofMinutes(5)));

        var response = clients.users().list(token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("lets an admin pass the role check")
    void adminEndpoint_asAdmin_passesAuthorization(AdminEndpoint endpoint) {
        String token = authApi.accessTokenFor(TestUsers.AUTHZ_ADMIN_EMAIL, TestUsers.PASSWORD);

        var response = endpoint.callWith(clients, token);

        assertThat(response.getStatusCode()).isEqualTo(endpoint.adminStatus());
    }

    private static void assertProblem(ResponseEntity<JsonNode> response, HttpStatus status, String code) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getHeaders().getContentType())
                .isNotNull()
                .satisfies(type -> assertThat(type.isCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)).isTrue());
        JsonNode body = bodyOf(response);
        assertThat(body.get("status").asInt()).isEqualTo(status.value());
        assertThat(body.get("code").asString()).isEqualTo(code);
    }

    /** Changes one character in the middle of the signature segment — the payload stays intact. */
    private static String tamperSignature(String jwt) {
        int signatureStart = jwt.lastIndexOf('.') + 1;
        int position = signatureStart + (jwt.length() - signatureStart) / 2;
        char replacement = jwt.charAt(position) == 'A' ? 'B' : 'A';
        return jwt.substring(0, position) + replacement + jwt.substring(position + 1);
    }

    /**
     * Signs an admin access token with the test secret, so its expiry can be chosen freely —
     * the real minting path always issues a fresh token.
     */
    private String adminAccessTokenExpiringAt(Instant expiresAt) {
        var key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .subject(TestUsers.AUTHZ_ADMIN_ID.toString())
                .claim("typ", TokenType.ACCESS.claimValue())
                .claim("email", TestUsers.AUTHZ_ADMIN_EMAIL)
                .claim("role", Role.ADMIN.name())
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(expiresAt.minus(Duration.ofMinutes(15))))
                .expiration(Date.from(expiresAt))
                .signWith(key)
                .compact();
    }
}
