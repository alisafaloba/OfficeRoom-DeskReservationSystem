package com.example.template.user.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.template.shared.security.Role;
import com.example.template.user.model.User;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Mapper unit tests mock nothing — the generated implementation runs as-is.
 */
@DisplayName("UserMapper")
class UserMapperTest {

    private final UserMapper userMapper = new UserMapperImpl();

    @Nested
    @DisplayName("toResponse")
    class ToResponseTests {

        @Test
        @DisplayName("maps every exposed field and nothing sensitive")
        void toResponse_populatedUser_mapsExposedFields() {
            var user = new User();
            user.setEmail("someone@example.com");
            user.setPasswordHash("{bcrypt}secret");
            user.setRole(Role.ADMIN);
            user.setTwoFactorEnabled(true);

            var response = userMapper.toResponse(user);

            assertThat(response.email()).isEqualTo("someone@example.com");
            assertThat(response.role()).isEqualTo(Role.ADMIN);
            assertThat(response.twoFactorEnabled()).isTrue();
        }

        @Test
        @DisplayName("maps personal data fields into the response")
        void toResponse_withPersonalData_mapsNameAndDepartment() {
            var user = new User();
            user.setEmail("jane@example.com");
            user.setPasswordHash("{bcrypt}hash");
            user.setRole(Role.USER);
            user.setFirstName("Jane");
            user.setLastName("Doe");
            user.setDepartment("Engineering");
            user.setActive(true);

            var response = userMapper.toResponse(user);

            assertThat(response.firstName()).isEqualTo("Jane");
            assertThat(response.lastName()).isEqualTo("Doe");
            assertThat(response.department()).isEqualTo("Engineering");
            assertThat(response.active()).isTrue();
        }

        @Test
        @DisplayName("maps preference fields into the nested UserPreferences record")
        void toResponse_withPreferences_mapsPreferencesNested() {
            var deskId = UUID.randomUUID();
            var user = new User();
            user.setEmail("pref@example.com");
            user.setPasswordHash("{bcrypt}hash");
            user.setRole(Role.USER);
            user.setFavoriteDeskId(deskId);
            user.setDefaultBuilding("Tower A");
            user.setDefaultFloor("5");

            var response = userMapper.toResponse(user);

            assertThat(response.preferences()).isNotNull();
            assertThat(response.preferences().favoriteDeskId()).isEqualTo(deskId);
            assertThat(response.preferences().defaultBuilding()).isEqualTo("Tower A");
            assertThat(response.preferences().defaultFloor()).isEqualTo("5");
        }

        @Test
        @DisplayName("preferences are all null when none are set")
        void toResponse_noPreferences_preferencesAllNull() {
            var user = new User();
            user.setEmail("bare@example.com");
            user.setPasswordHash("{bcrypt}hash");
            user.setRole(Role.USER);

            var response = userMapper.toResponse(user);

            assertThat(response.preferences()).isNotNull();
            assertThat(response.preferences().favoriteDeskId()).isNull();
            assertThat(response.preferences().defaultBuilding()).isNull();
            assertThat(response.preferences().defaultFloor()).isNull();
        }
    }
}
