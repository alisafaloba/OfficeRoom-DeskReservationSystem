package com.example.template.shared.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("ScopeAccessGuard")
class ScopeAccessGuardTest {

    private static final UUID CALLER_ID = UUID.randomUUID();
    private static final UUID OTHER_ID = UUID.randomUUID();
    private static final AuthPrincipal ADMIN = new AuthPrincipal(CALLER_ID, "admin@example.com", Role.ADMIN);
    private static final AuthPrincipal EMPLOYEE = new AuthPrincipal(CALLER_ID, "employee@example.com", Role.USER);

    private final ScopeAccessGuard guard = new ScopeAccessGuard();

    @Nested
    @DisplayName("requireScopeAccess")
    class RequireScopeAccessTests {

        @Test
        @DisplayName("lets an admin reach data owned by anyone")
        void requireScopeAccess_adminOtherOwner_allows() {
            assertThatCode(() -> guard.requireScopeAccess(ADMIN, OTHER_ID)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("lets an employee reach their own data")
        void requireScopeAccess_employeeOwnData_allows() {
            assertThatCode(() -> guard.requireScopeAccess(EMPLOYEE, CALLER_ID)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("denies an employee data owned by someone else with FORBIDDEN")
        void requireScopeAccess_employeeOtherOwner_throwsForbidden() {
            assertThatThrownBy(() -> guard.requireScopeAccess(EMPLOYEE, OTHER_ID))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.FORBIDDEN);
        }
    }

    @Nested
    @DisplayName("requireAllScopes")
    class RequireAllScopesTests {

        @Test
        @DisplayName("lets an admin access all scopes")
        void requireAllScopes_admin_allows() {
            assertThatCode(() -> guard.requireAllScopes(ADMIN)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("denies an employee access to all scopes with FORBIDDEN")
        void requireAllScopes_employee_throwsForbidden() {
            assertThatThrownBy(() -> guard.requireAllScopes(EMPLOYEE))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.FORBIDDEN);
        }
    }
}
