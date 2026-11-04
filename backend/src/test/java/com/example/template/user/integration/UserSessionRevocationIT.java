package com.example.template.user.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.integration.AbstractIntegrationTest;
import com.example.template.integration.support.AuthApiClient;
import com.example.template.integration.support.UserApiClient;
import com.github.database.rider.core.api.dataset.DataSet;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * A role change must end the user's sessions (acceptance criterion of Task 1.4), whichever
 * endpoint performs it, and must leave them alone when nothing changes. No {@code @Nested}
 * groups: database-rider does not see an enclosing class's {@code @DataSet}.
 */
@DataSet("datasets/user-sessions-users.yml")
@DisplayName("User session revocation")
class UserSessionRevocationIT extends AbstractIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String ADMIN_EMAIL = "sessions-admin@test.local";
    private static final String EMPLOYEE_EMAIL = "sessions-employee@test.local";
    private static final UUID EMPLOYEE_ID = UUID.fromString("dddddddd-0000-0000-0000-000000000002");

    private AuthApiClient authApi;
    private UserApiClient userApi;

    @BeforeEach
    void setUp() {
        authApi = new AuthApiClient(restTemplate);
        userApi = new UserApiClient(restTemplate);
    }

    @Test
    @DisplayName("the role endpoint revokes the user's refresh token")
    void changeRole_revokesRefreshToken() {
        String cookie = AuthApiClient.refreshCookieOf(authApi.login(EMPLOYEE_EMAIL, PASSWORD));
        String adminToken = authApi.accessTokenFor(ADMIN_EMAIL, PASSWORD);

        var change = userApi.changeRole(adminToken, EMPLOYEE_ID.toString(), "ADMIN");
        var refresh = authApi.refresh(cookie, null);

        assertThat(change.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(refresh.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("changing the role through the general update endpoint revokes the refresh token too")
    void update_withRoleChange_revokesRefreshToken() {
        String cookie = AuthApiClient.refreshCookieOf(authApi.login(EMPLOYEE_EMAIL, PASSWORD));
        String adminToken = authApi.accessTokenFor(ADMIN_EMAIL, PASSWORD);

        var update = userApi.update(adminToken, EMPLOYEE_ID.toString(), EMPLOYEE_EMAIL, "ADMIN", null);
        var refresh = authApi.refresh(cookie, null);

        assertThat(update.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(refresh.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("an update that keeps the role leaves the session alone")
    void update_withoutRoleChange_keepsSession() {
        String cookie = AuthApiClient.refreshCookieOf(authApi.login(EMPLOYEE_EMAIL, PASSWORD));
        String adminToken = authApi.accessTokenFor(ADMIN_EMAIL, PASSWORD);

        var update = userApi.update(adminToken, EMPLOYEE_ID.toString(), EMPLOYEE_EMAIL, "USER", null);
        var refresh = authApi.refresh(cookie, null);

        assertThat(update.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(refresh.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("setting the role the user already has changes nothing and keeps the session")
    void changeRole_sameRole_keepsSession() {
        String cookie = AuthApiClient.refreshCookieOf(authApi.login(EMPLOYEE_EMAIL, PASSWORD));
        String adminToken = authApi.accessTokenFor(ADMIN_EMAIL, PASSWORD);

        var change = userApi.changeRole(adminToken, EMPLOYEE_ID.toString(), "USER");
        var refresh = authApi.refresh(cookie, null);

        assertThat(change.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(refresh.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
