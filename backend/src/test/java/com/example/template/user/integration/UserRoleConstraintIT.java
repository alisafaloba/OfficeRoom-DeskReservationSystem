package com.example.template.user.integration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.integration.AbstractIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The role model is enforced by the schema itself (ck_users_role), not only by the Java enum.
 * Rows are written with plain SQL on purpose — the JPA mapping could never produce an unknown
 * role, so going through it would prove nothing.
 */
@DisplayName("users.role check constraint")
class UserRoleConstraintIT extends AbstractIntegrationTest {

    private static final String INSERT_USER = """
            INSERT INTO users (id, created_at, updated_at, version, email, password_hash, role,
                               two_factor_enabled, failed_login_attempts)
            VALUES (?, now(), now(), 0, ?, 'irrelevant-hash', ?, false, 0)
            """;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @ParameterizedTest(name = "accepts role {0}")
    @ValueSource(strings = {"ADMIN", "USER"})
    void insert_supportedRole_succeeds(String role) {
        assertThatCode(() -> insertUserWithRole(role)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("rejects the removed MANAGER role")
    void insert_managerRole_isRejected() {
        assertThatThrownBy(() -> insertUserWithRole("MANAGER"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_users_role");
    }

    private void insertUserWithRole(String role) {
        // Unique values per call: the database is shared across test classes and never reset.
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(INSERT_USER, id, "role-check-" + id + "@test.local", role);
    }
}
