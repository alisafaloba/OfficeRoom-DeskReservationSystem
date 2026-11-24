package com.example.template.user.service;

import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import com.example.template.shared.security.AuthPrincipal;
import com.example.template.shared.security.Role;
import com.example.template.shared.security.ScopeAccessGuard;
import com.example.template.user.dto.ChangeRoleRequest;
import com.example.template.user.dto.CreateUserRequest;
import com.example.template.user.dto.UpdateOwnProfileRequest;
import com.example.template.user.dto.UpdateUserRequest;
import com.example.template.user.dto.UserPreferences;
import com.example.template.user.dto.UserResponse;
import com.example.template.user.event.UserAccessChangedEvent;
import com.example.template.user.event.UserCreatedEvent;
import com.example.template.user.event.UserDeletedEvent;
import com.example.template.user.mapper.UserMapper;
import com.example.template.user.model.User;
import com.example.template.user.repository.UserRepository;
import com.example.template.user.repository.UserSpecifications;
import java.util.HashMap;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PagedModel;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumes and returns DTOs — entities never leave the service; the mapper is a service
 * collaborator, never a controller one.
 */
@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final ScopeAccessGuard scopeAccessGuard;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher eventPublisher;
    private final ResourceRepository resourceRepository;
    private final BuildingRepository buildingRepository;
    private final FloorRepository floorRepository;

    public UserService(
            UserRepository userRepository,
            UserMapper userMapper,
            ScopeAccessGuard scopeAccessGuard,
            PasswordEncoder passwordEncoder,
            ApplicationEventPublisher eventPublisher,
            ResourceRepository resourceRepository,
            BuildingRepository buildingRepository,
            FloorRepository floorRepository) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.scopeAccessGuard = scopeAccessGuard;
        this.passwordEncoder = passwordEncoder;
        this.eventPublisher = eventPublisher;
        this.resourceRepository = resourceRepository;
        this.buildingRepository = buildingRepository;
        this.floorRepository = floorRepository;
    }

    @Transactional(readOnly = true)
    public UserResponse getById(AuthPrincipal principal, UUID id) {
        scopeAccessGuard.requireScopeAccess(principal, id);
        return userRepository
                .findById(id)
                .map(userMapper::toResponse)
                .orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public UserResponse getOwn(AuthPrincipal principal) {
        return userRepository
                .findById(principal.userId())
                .map(userMapper::toResponse)
                .orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public PagedModel<UserResponse> list(
            AuthPrincipal principal,
            @Nullable String query,
            @Nullable Role role,
            @Nullable Boolean active,
            @Nullable String department,
            Pageable pageable) {
        scopeAccessGuard.requireAllScopes(principal);
        var spec = UserSpecifications.matching(query, role, active, department);
        return new PagedModel<>(userRepository.findAll(spec, pageable).map(userMapper::toResponse));
    }

    @Transactional
    public UserResponse create(CreateUserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_IN_USE);
        }
        var user = new User();
        user.setEmail(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(request.role());
        var saved = userRepository.save(user);
        log.info("User {} created with role {}", saved.requireId(), saved.getRole());
        eventPublisher.publishEvent(new UserCreatedEvent(saved.requireId(), saved.getEmail()));
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse update(AuthPrincipal principal, UUID id, UpdateUserRequest request) {
        var user = userRepository.findById(id).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        if (!user.getEmail().equals(request.email()) && userRepository.existsByEmail(request.email())) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_IN_USE);
        }
        user.setEmail(request.email());
        if (request.password() != null) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        log.info("User {} updated by {}", id, principal.userId());
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse changeRole(AuthPrincipal principal, UUID id, ChangeRoleRequest request) {
        if (principal.userId().equals(id)) {
            throw new ApiException(ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT);
        }
        var user = userRepository.findById(id).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        if (user.getRole() == request.role()) {
            return userMapper.toResponse(user);
        }
        applyRoleChange(user, id, request.role());
        var saved = userRepository.save(user);
        log.info("Role of user {} changed to {} by {}", id, request.role(), principal.userId());
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse deactivate(AuthPrincipal principal, UUID id) {
        if (principal.userId().equals(id)) {
            throw new ApiException(ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT);
        }
        var user = userRepository.findById(id).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        if (!user.isActive()) {
            return userMapper.toResponse(user);
        }
        if (user.getRole() == Role.ADMIN && isLastActiveAdmin()) {
            throw new ApiException(ErrorCode.LAST_ADMIN_REQUIRED);
        }
        user.setActive(false);
        var saved = userRepository.save(user);
        eventPublisher.publishEvent(new UserAccessChangedEvent(id));
        log.info("User {} deactivated by {}", id, principal.userId());
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse reactivate(AuthPrincipal principal, UUID id) {
        var user = userRepository.findById(id).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        if (user.isActive()) {
            return userMapper.toResponse(user);
        }
        user.setActive(true);
        var saved = userRepository.save(user);
        log.info("User {} reactivated by {}", id, principal.userId());
        return userMapper.toResponse(saved);
    }

    /** One rule set for every role change: never lose the last active admin, always revoke sessions. */
    private void applyRoleChange(User user, UUID id, Role newRole) {
        if (user.getRole() == Role.ADMIN && user.isActive() && isLastActiveAdmin()) {
            throw new ApiException(ErrorCode.LAST_ADMIN_REQUIRED);
        }
        user.setRole(newRole);
        eventPublisher.publishEvent(new UserAccessChangedEvent(id));
    }

    private boolean isLastActiveAdmin() {
        return userRepository.lockActiveByRole(Role.ADMIN).size() <= 1;
    }

    @Transactional
    public void delete(AuthPrincipal principal, UUID id) {
        if (principal.userId().equals(id)) {
            throw new ApiException(ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT);
        }
        var user = userRepository.findById(id).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        eventPublisher.publishEvent(new UserDeletedEvent(id, user.getEmail()));
        userRepository.delete(user);
        log.info("User {} deleted by {}", id, principal.userId());
    }

    /**
     * Updates the personal data and booking preferences of the authenticated caller.
     * E-mail and role are intentionally not settable through this endpoint — use the
     * admin {@code PUT /users/{id}} for those.
     *
     * <p>The preferences must name existing catalog entries that fit together: the floor belongs to
     * the building and the desk is a {@link ResourceType#DESK} on the floor. Otherwise the request
     * fails with 400 and a field error on the offending {@code preferences.*} field.
     */
    @Transactional
    public UserResponse updateOwnProfile(AuthPrincipal principal, UpdateOwnProfileRequest request) {
        var user = userRepository
                .findById(principal.userId())
                .orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        if (request.preferences() != null) {
            requireValidPreferences(request.preferences());
        }
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setDepartment(request.department());
        if (request.preferences() != null) {
            user.setFavoriteDeskId(request.preferences().favoriteDeskId());
            user.setDefaultBuildingId(request.preferences().defaultBuildingId());
            user.setDefaultFloorId(request.preferences().defaultFloorId());
        }
        log.info("User {} updated own profile", principal.userId());
        return userMapper.toResponse(userRepository.save(user));
    }

    /**
     * Checks every preference against the catalog and against the others, and reports all
     * problems at once, so a form can mark each field in one round trip.
     */
    private void requireValidPreferences(UserPreferences preferences) {
        var errors = new HashMap<String, String>();
        var buildingId = preferences.defaultBuildingId();
        var floorId = preferences.defaultFloorId();
        var deskId = preferences.favoriteDeskId();

        if (buildingId != null && !buildingRepository.existsById(buildingId)) {
            errors.put("preferences.defaultBuildingId", "The default building must be an existing building");
        }
        if (floorId != null) {
            var floor = floorRepository.findById(floorId).orElse(null);
            if (floor == null) {
                errors.put("preferences.defaultFloorId", "The default floor must be an existing floor");
            } else if (!floor.getBuildingId().equals(buildingId)) {
                errors.put("preferences.defaultFloorId", "The default floor must belong to the default building");
            }
        }
        if (deskId != null) {
            var desk = resourceRepository.findById(deskId).orElse(null);
            if (desk == null || desk.getType() != ResourceType.DESK) {
                errors.put("preferences.favoriteDeskId", "The favourite desk must be an existing desk");
            } else if (!desk.getFloorId().equals(floorId)) {
                errors.put("preferences.favoriteDeskId", "The favourite desk must be on the default floor");
            }
        }
        if (!errors.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, errors);
        }
    }
}
