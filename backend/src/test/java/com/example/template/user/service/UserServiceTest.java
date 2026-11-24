package com.example.template.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.building.model.Floor;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import com.example.template.shared.security.AuthPrincipal;
import com.example.template.shared.security.Role;
import com.example.template.shared.security.ScopeAccessGuard;
import com.example.template.user.dto.CreateUserRequest;
import com.example.template.user.dto.UpdateOwnProfileRequest;
import com.example.template.user.dto.UpdateUserRequest;
import com.example.template.user.dto.UserPreferences;
import com.example.template.user.dto.UserResponse;
import com.example.template.user.event.UserCreatedEvent;
import com.example.template.user.event.UserDeletedEvent;
import com.example.template.user.mapper.UserMapper;
import com.example.template.user.model.User;
import com.example.template.user.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserService")
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserMapper userMapper;

    @Mock
    private ScopeAccessGuard scopeAccessGuard;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ResourceRepository resourceRepository;

    @Mock
    private BuildingRepository buildingRepository;

    @Mock
    private FloorRepository floorRepository;

    @InjectMocks
    private UserService userService;

    private static final UUID CALLER_ID = UUID.randomUUID();
    private static final AuthPrincipal PRINCIPAL = new AuthPrincipal(CALLER_ID, "caller@example.com", Role.USER);

    private static User user() {
        var user = new User();
        user.setEmail("someone@example.com");
        user.setPasswordHash("{bcrypt}hash");
        user.setRole(Role.USER);
        return user;
    }

    private static UserResponse response(String email) {
        return new UserResponse(UUID.randomUUID(), email, Role.USER, false, Instant.now(),
                null, null, null, true, new UserPreferences(null, null, null));
    }

    @Nested
    @DisplayName("getById")
    class GetByIdTests {

        @Test
        @DisplayName("returns the mapped DTO when the scope guard allows access")
        void getById_scopeAllowed_returnsResponse() {
            var target = user();
            var expected = response(target.getEmail());
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(userMapper.toResponse(target)).thenReturn(expected);

            var result = userService.getById(PRINCIPAL, CALLER_ID);

            assertThat(result).isSameAs(expected);
            verify(scopeAccessGuard).requireScopeAccess(PRINCIPAL, CALLER_ID);
        }

        @Test
        @DisplayName("propagates FORBIDDEN and never touches the repository when the guard denies")
        void getById_scopeDenied_throwsForbiddenWithoutRepositoryAccess() {
            var otherId = UUID.randomUUID();
            doThrow(new ApiException(ErrorCode.FORBIDDEN))
                    .when(scopeAccessGuard)
                    .requireScopeAccess(PRINCIPAL, otherId);

            assertThatThrownBy(() -> userService.getById(PRINCIPAL, otherId))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.FORBIDDEN);
            verify(userRepository, never()).findById(any());
        }

        @Test
        @DisplayName("throws USER_NOT_FOUND when the id does not exist")
        void getById_unknownId_throwsUserNotFound() {
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.getById(PRINCIPAL, CALLER_ID))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.USER_NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("list")
    class ListTests {

        @Test
        @DisplayName("returns the mapped page envelope when the caller may reach all scopes")
        void list_allScopesAllowed_returnsPagedResponses() {
            Pageable pageable = PageRequest.of(0, 20);
            var target = user();
            Page<User> page = new PageImpl<>(List.of(target), pageable, 1);
            when(userRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(page);
            when(userMapper.toResponse(target)).thenReturn(response(target.getEmail()));

            var result = userService.list(PRINCIPAL, null, null, null, null, pageable);

            assertThat(result.getContent()).hasSize(1);
            verify(scopeAccessGuard).requireAllScopes(PRINCIPAL);
        }

        @Test
        @DisplayName("propagates FORBIDDEN and never queries when the guard denies")
        void list_scopeDenied_throwsForbiddenWithoutQuery() {
            Pageable pageable = PageRequest.of(0, 20);
            doThrow(new ApiException(ErrorCode.FORBIDDEN))
                    .when(scopeAccessGuard)
                    .requireAllScopes(PRINCIPAL);

            assertThatThrownBy(() -> userService.list(PRINCIPAL, null, null, null, null, pageable))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.FORBIDDEN);
            verify(userRepository, never()).findAll(any(Specification.class), any(Pageable.class));
        }
    }

    @Nested
    @DisplayName("create")
    class CreateTests {

        private final CreateUserRequest request =
                new CreateUserRequest("new@example.com", "long-password-123", Role.USER);

        @Test
        @DisplayName("encodes the password, saves, publishes UserCreatedEvent and returns the mapped DTO")
        void create_emailFree_savesAndPublishesEvent() {
            when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
            when(passwordEncoder.encode("long-password-123")).thenReturn("{bcrypt}encoded");
            when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
                var saved = invocation.getArgument(0, User.class);
                // Simulate persistence: the returned entity has an id, like the real repository's.
                ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());
                return saved;
            });
            when(userMapper.toResponse(any(User.class))).thenReturn(response("new@example.com"));

            var created = userService.create(request);

            assertThat(created.email()).isEqualTo("new@example.com");
            var savedUser = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(savedUser.capture());
            assertThat(savedUser.getValue().getPasswordHash()).isEqualTo("{bcrypt}encoded");
            verify(eventPublisher).publishEvent(any(UserCreatedEvent.class));
        }

        @Test
        @DisplayName("throws EMAIL_ALREADY_IN_USE and never saves when the email is taken")
        void create_emailTaken_throwsConflictWithoutSaving() {
            when(userRepository.existsByEmail("new@example.com")).thenReturn(true);

            assertThatThrownBy(() -> userService.create(request))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.EMAIL_ALREADY_IN_USE);
            verify(userRepository, never()).save(any());
            verify(eventPublisher, never()).publishEvent(any());
        }
    }

    @Nested
    @DisplayName("update")
    class UpdateTests {

        private final UUID targetId = UUID.randomUUID();

        @Test
        @DisplayName("applies the e-mail, keeps role and password when none is given")
        void update_noPassword_keepsHash() {
            var target = user();
            var roleBefore = target.getRole();
            when(userRepository.findById(targetId)).thenReturn(Optional.of(target));
            when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
            when(userRepository.save(target)).thenReturn(target);
            when(userMapper.toResponse(target)).thenReturn(response("new@example.com"));

            userService.update(PRINCIPAL, targetId, new UpdateUserRequest("new@example.com", null));

            assertThat(target.getEmail()).isEqualTo("new@example.com");
            assertThat(target.getRole()).isEqualTo(roleBefore);
            assertThat(target.getPasswordHash()).isEqualTo("{bcrypt}hash");
            verify(passwordEncoder, never()).encode(any());
        }

        @Test
        @DisplayName("re-encodes the password when one is given")
        void update_withPassword_encodesIt() {
            var target = user();
            when(userRepository.findById(targetId)).thenReturn(Optional.of(target));
            when(passwordEncoder.encode("another-long-password")).thenReturn("{bcrypt}new");
            when(userRepository.save(target)).thenReturn(target);
            when(userMapper.toResponse(target)).thenReturn(response(target.getEmail()));

            userService.update(
                    PRINCIPAL, targetId, new UpdateUserRequest(target.getEmail(), "another-long-password"));

            assertThat(target.getPasswordHash()).isEqualTo("{bcrypt}new");
        }

        @Test
        @DisplayName("throws EMAIL_ALREADY_IN_USE when the new e-mail is taken")
        void update_emailTaken_throwsConflict() {
            when(userRepository.findById(targetId)).thenReturn(Optional.of(user()));
            when(userRepository.existsByEmail("taken@example.com")).thenReturn(true);

            assertThatThrownBy(() ->
                            userService.update(PRINCIPAL, targetId, new UpdateUserRequest("taken@example.com", null)))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.EMAIL_ALREADY_IN_USE);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("throws USER_NOT_FOUND for an unknown id")
        void update_unknownId_throwsNotFound() {
            when(userRepository.findById(targetId)).thenReturn(Optional.empty());

            assertThatThrownBy(() ->
                            userService.update(PRINCIPAL, targetId, new UpdateUserRequest("a@example.com", null)))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.USER_NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("delete")
    class DeleteTests {

        @Test
        @DisplayName("publishes UserDeletedEvent, then deletes the user")
        void delete_existingUser_publishesEventAndDeletes() {
            var targetId = UUID.randomUUID();
            var target = user();
            when(userRepository.findById(targetId)).thenReturn(Optional.of(target));

            userService.delete(PRINCIPAL, targetId);

            var order = org.mockito.Mockito.inOrder(eventPublisher, userRepository);
            order.verify(eventPublisher).publishEvent(any(UserDeletedEvent.class));
            order.verify(userRepository).delete(target);
        }

        @Test
        @DisplayName("refuses to delete the caller's own account")
        void delete_self_throwsConflict() {
            assertThatThrownBy(() -> userService.delete(PRINCIPAL, CALLER_ID))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT);
            verify(userRepository, never()).delete(any(User.class));
        }

        @Test
        @DisplayName("throws USER_NOT_FOUND for an unknown id")
        void delete_unknownId_throwsNotFound() {
            var unknown = UUID.randomUUID();
            when(userRepository.findById(unknown)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.delete(PRINCIPAL, unknown))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.USER_NOT_FOUND);
            verify(userRepository, never()).delete(any(User.class));
        }
    }

    @Nested
    @DisplayName("updateOwnProfile")
    class UpdateOwnProfileTests {

        private final UserPreferences emptyPrefs = new UserPreferences(null, null, null);
        private final UUID buildingId = UUID.randomUUID();
        private final UUID floorId = UUID.randomUUID();
        private final UUID deskId = UUID.randomUUID();

        private Floor floorIn(UUID building) {
            var floor = new Floor(building);
            floor.setName("Etajul 1");
            return floor;
        }

        private Resource resourceOn(UUID floor, ResourceType type) {
            var resource = new Resource(floor);
            resource.setName("Birou");
            resource.setType(type);
            return resource;
        }

        private void stubValidChain() {
            when(buildingRepository.existsById(buildingId)).thenReturn(true);
            when(floorRepository.findById(floorId)).thenReturn(Optional.of(floorIn(buildingId)));
            when(resourceRepository.findById(deskId)).thenReturn(Optional.of(resourceOn(floorId, ResourceType.DESK)));
        }

        private void stubSave(User target) {
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(userRepository.save(target)).thenReturn(target);
            when(userMapper.toResponse(target)).thenReturn(response(target.getEmail()));
        }

        private UpdateOwnProfileRequest requestWith(UserPreferences prefs) {
            return new UpdateOwnProfileRequest("Jane", "Doe", "Sales", prefs);
        }

        private void assertRejected(User target, UpdateOwnProfileRequest request, String... fields) {
            assertThatThrownBy(() -> userService.updateOwnProfile(PRINCIPAL, request))
                    .isInstanceOfSatisfying(ApiException.class, exception -> {
                        assertThat(exception.errorCode()).isEqualTo(ErrorCode.VALIDATION_FAILED);
                        assertThat(exception.fieldErrors()).containsOnlyKeys(fields);
                    });
            assertThat(target.getFirstName()).isNull();
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("updates personal data and a consistent building, floor and desk, saves and returns the DTO")
        void updateOwnProfile_validRequest_updatesFieldsAndSaves() {
            var target = user();
            stubValidChain();
            stubSave(target);

            var result = userService.updateOwnProfile(
                    PRINCIPAL, requestWith(new UserPreferences(deskId, buildingId, floorId)));

            assertThat(target.getFirstName()).isEqualTo("Jane");
            assertThat(target.getLastName()).isEqualTo("Doe");
            assertThat(target.getDepartment()).isEqualTo("Sales");
            assertThat(target.getDefaultBuildingId()).isEqualTo(buildingId);
            assertThat(target.getDefaultFloorId()).isEqualTo(floorId);
            assertThat(target.getFavoriteDeskId()).isEqualTo(deskId);
            // email and role must not change
            assertThat(target.getEmail()).isEqualTo("someone@example.com");
            assertThat(target.getRole()).isEqualTo(Role.USER);
            assertThat(result).isNotNull();
            verify(userRepository).save(target);
        }

        @Test
        @DisplayName("a building alone is stored without any floor or desk lookup")
        void updateOwnProfile_buildingOnly_isStored() {
            var target = user();
            when(buildingRepository.existsById(buildingId)).thenReturn(true);
            stubSave(target);

            userService.updateOwnProfile(PRINCIPAL, requestWith(new UserPreferences(null, buildingId, null)));

            assertThat(target.getDefaultBuildingId()).isEqualTo(buildingId);
            assertThat(target.getDefaultFloorId()).isNull();
            verify(floorRepository, never()).findById(any());
            verify(resourceRepository, never()).findById(any());
        }

        @Test
        @DisplayName("null preferences block leaves existing preference fields unchanged")
        void updateOwnProfile_nullPreferences_leavesPreferencesUntouched() {
            var target = user();
            target.setDefaultBuildingId(buildingId);
            stubSave(target);

            userService.updateOwnProfile(PRINCIPAL, new UpdateOwnProfileRequest("Alice", "Smith", null, null));

            assertThat(target.getDefaultBuildingId()).isEqualTo(buildingId);
        }

        @Test
        @DisplayName("clearing every preference (all null) needs no catalog lookup")
        void updateOwnProfile_allNull_clearsWithoutLookup() {
            var target = user();
            target.setFavoriteDeskId(deskId);
            target.setDefaultBuildingId(buildingId);
            target.setDefaultFloorId(floorId);
            stubSave(target);

            userService.updateOwnProfile(PRINCIPAL, requestWith(emptyPrefs));

            assertThat(target.getFavoriteDeskId()).isNull();
            assertThat(target.getDefaultBuildingId()).isNull();
            assertThat(target.getDefaultFloorId()).isNull();
            verify(buildingRepository, never()).existsById(any());
            verify(floorRepository, never()).findById(any());
            verify(resourceRepository, never()).findById(any());
        }

        @Test
        @DisplayName("rejects an unknown building with a field error and saves nothing")
        void updateOwnProfile_unknownBuilding_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(buildingRepository.existsById(buildingId)).thenReturn(false);

            assertRejected(target, requestWith(new UserPreferences(null, buildingId, null)),
                    "preferences.defaultBuildingId");
        }

        @Test
        @DisplayName("rejects an unknown floor")
        void updateOwnProfile_unknownFloor_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(buildingRepository.existsById(buildingId)).thenReturn(true);
            when(floorRepository.findById(floorId)).thenReturn(Optional.empty());

            assertRejected(target, requestWith(new UserPreferences(null, buildingId, floorId)),
                    "preferences.defaultFloorId");
        }

        @Test
        @DisplayName("rejects a floor that belongs to another building")
        void updateOwnProfile_floorOfAnotherBuilding_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(buildingRepository.existsById(buildingId)).thenReturn(true);
            when(floorRepository.findById(floorId)).thenReturn(Optional.of(floorIn(UUID.randomUUID())));

            assertRejected(target, requestWith(new UserPreferences(null, buildingId, floorId)),
                    "preferences.defaultFloorId");
        }

        @Test
        @DisplayName("rejects a floor without a default building")
        void updateOwnProfile_floorWithoutBuilding_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(floorRepository.findById(floorId)).thenReturn(Optional.of(floorIn(buildingId)));

            assertRejected(target, requestWith(new UserPreferences(null, null, floorId)),
                    "preferences.defaultFloorId");
        }

        @Test
        @DisplayName("rejects an unknown favourite desk")
        void updateOwnProfile_unknownDesk_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(resourceRepository.findById(deskId)).thenReturn(Optional.empty());

            assertRejected(target, requestWith(new UserPreferences(deskId, null, null)),
                    "preferences.favoriteDeskId");
        }

        @Test
        @DisplayName("rejects a favourite desk that is another resource type")
        void updateOwnProfile_notADesk_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(buildingRepository.existsById(buildingId)).thenReturn(true);
            when(floorRepository.findById(floorId)).thenReturn(Optional.of(floorIn(buildingId)));
            when(resourceRepository.findById(deskId))
                    .thenReturn(Optional.of(resourceOn(floorId, ResourceType.PARKING_SPOT)));

            assertRejected(target, requestWith(new UserPreferences(deskId, buildingId, floorId)),
                    "preferences.favoriteDeskId");
        }

        @Test
        @DisplayName("rejects a favourite desk that is on another floor")
        void updateOwnProfile_deskOnAnotherFloor_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(buildingRepository.existsById(buildingId)).thenReturn(true);
            when(floorRepository.findById(floorId)).thenReturn(Optional.of(floorIn(buildingId)));
            when(resourceRepository.findById(deskId))
                    .thenReturn(Optional.of(resourceOn(UUID.randomUUID(), ResourceType.DESK)));

            assertRejected(target, requestWith(new UserPreferences(deskId, buildingId, floorId)),
                    "preferences.favoriteDeskId");
        }

        @Test
        @DisplayName("rejects a favourite desk without a default floor")
        void updateOwnProfile_deskWithoutFloor_throwsValidationFailed() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(resourceRepository.findById(deskId)).thenReturn(Optional.of(resourceOn(floorId, ResourceType.DESK)));

            assertRejected(target, requestWith(new UserPreferences(deskId, null, null)),
                    "preferences.favoriteDeskId");
        }

        @Test
        @DisplayName("reports every invalid preference at once")
        void updateOwnProfile_everythingInvalid_reportsAllFields() {
            var target = user();
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.of(target));
            when(buildingRepository.existsById(buildingId)).thenReturn(false);
            when(floorRepository.findById(floorId)).thenReturn(Optional.empty());
            when(resourceRepository.findById(deskId)).thenReturn(Optional.empty());

            assertRejected(target, requestWith(new UserPreferences(deskId, buildingId, floorId)),
                    "preferences.defaultBuildingId", "preferences.defaultFloorId", "preferences.favoriteDeskId");
        }

        @Test
        @DisplayName("throws USER_NOT_FOUND for an unknown user id")
        void updateOwnProfile_unknownUser_throwsNotFound() {
            when(userRepository.findById(CALLER_ID)).thenReturn(Optional.empty());
            var request = new UpdateOwnProfileRequest("X", "Y", null, null);

            assertThatThrownBy(() -> userService.updateOwnProfile(PRINCIPAL, request))
                    .isInstanceOf(ApiException.class)
                    .extracting(exception -> ((ApiException) exception).errorCode())
                    .isEqualTo(ErrorCode.USER_NOT_FOUND);
            verify(userRepository, never()).save(any());
        }
    }
}
