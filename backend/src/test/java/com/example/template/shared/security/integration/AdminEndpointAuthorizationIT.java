package com.example.template.shared.security.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
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
    private UserApiClient userApi;

    /**
     * One admin endpoint: how to call it, and the status an admin gets for that call.
     */
    record AdminEndpoint(
            String name, BiFunction<UserApiClient, String, ResponseEntity<JsonNode>> call, HttpStatus adminStatus) {

        ResponseEntity<JsonNode> callWith(UserApiClient client, String accessToken) {
            return call.apply(client, accessToken);
        }

        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<AdminEndpoint> adminEndpoints() {
        String unknownId = UUID.randomUUID().toString();
        return Stream.of(
                new AdminEndpoint("GET /users", UserApiClient::list, HttpStatus.OK),
                new AdminEndpoint(
                        "POST /users",
                        (client, token) -> client.create(
                                token, TestUsers.AUTHZ_EMPLOYEE_EMAIL, "valid-password-123", Role.USER.name()),
                        HttpStatus.CONFLICT),
                new AdminEndpoint(
                        "PUT /users/{id}",
                        (client, token) -> client.update(
                                token, unknownId, "someone@test.local", Role.USER.name(), null),
                        HttpStatus.NOT_FOUND),
                new AdminEndpoint(
                        "DELETE /users/{id}", (client, token) -> client.delete(token, unknownId), HttpStatus.NOT_FOUND));
    }

    @BeforeEach
    void setUp() {
        authApi = new AuthApiClient(restTemplate);
        userApi = new UserApiClient(restTemplate);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("denies an employee with 403 FORBIDDEN as ProblemDetail")
    void adminEndpoint_asEmployee_returns403Problem(AdminEndpoint endpoint) {
        String token = authApi.accessTokenFor(TestUsers.AUTHZ_EMPLOYEE_EMAIL, TestUsers.PASSWORD);

        var response = endpoint.callWith(userApi, token);

        assertProblem(response, HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail without a token")
    void adminEndpoint_withoutToken_returns401Problem(AdminEndpoint endpoint) {
        var response = endpoint.callWith(userApi, null);

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail for a malformed token")
    void adminEndpoint_malformedToken_returns401Problem(AdminEndpoint endpoint) {
        var response = endpoint.callWith(userApi, "not-a-jwt");

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail for an admin token with a tampered signature")
    void adminEndpoint_tamperedAdminToken_returns401Problem(AdminEndpoint endpoint) {
        String token = authApi.accessTokenFor(TestUsers.AUTHZ_ADMIN_EMAIL, TestUsers.PASSWORD);

        var response = endpoint.callWith(userApi, tamperSignature(token));

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("answers 401 UNAUTHORIZED as ProblemDetail for an expired admin token")
    void adminEndpoint_expiredAdminToken_returns401Problem(AdminEndpoint endpoint) {
        String token = adminAccessTokenExpiringAt(Instant.now().minus(EXPIRED_FOR));

        var response = endpoint.callWith(userApi, token);

        assertProblem(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @Test
    @DisplayName("accepts the self-signed admin token while it is valid — guards the expired-token test")
    void selfSignedAdminToken_notExpired_isAccepted() {
        String token = adminAccessTokenExpiringAt(Instant.now().plus(Duration.ofMinutes(5)));

        var response = userApi.list(token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("adminEndpoints")
    @DisplayName("lets an admin pass the role check")
    void adminEndpoint_asAdmin_passesAuthorization(AdminEndpoint endpoint) {
        String token = authApi.accessTokenFor(TestUsers.AUTHZ_ADMIN_EMAIL, TestUsers.PASSWORD);

        var response = endpoint.callWith(userApi, token);

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
