package com.example.template.user.service;

import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import com.example.template.shared.security.AuthPrincipal;
import com.example.template.shared.security.Role;
import com.example.template.shared.security.ScopeAccessGuard;
import com.example.template.user.dto.ChangeRoleRequest;
import com.example.template.user.dto.CreateUserRequest;
import com.example.template.user.dto.UpdateOwnProfileRequest;
import com.example.template.user.dto.UpdateUserRequest;
import com.example.template.user.dto.UserResponse;
import com.example.template.user.event.UserAccessChangedEvent;
import com.example.template.user.event.UserCreatedEvent;
import com.example.template.user.event.UserDeletedEvent;
import com.example.template.user.mapper.UserMapper;
import com.example.template.user.model.User;
import com.example.template.user.repository.UserRepository;
import com.example.template.user.repository.UserSpecifications;
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

    public UserService(
            UserRepository userRepository,
            UserMapper userMapper,
            ScopeAccessGuard scopeAccessGuard,
            PasswordEncoder passwordEncoder,
            ApplicationEventPublisher eventPublisher) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.scopeAccessGuard = scopeAccessGuard;
        this.passwordEncoder = passwordEncoder;
        this.eventPublisher = eventPublisher;
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
        if (principal.userId().equals(id) && request.role() != user.getRole()) {
            throw new ApiException(ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT);
        }
        if (!user.getEmail().equals(request.email()) && userRepository.existsByEmail(request.email())) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_IN_USE);
        }
        user.setEmail(request.email());
        if (request.role() != user.getRole()) {
            applyRoleChange(user, id, request.role());
        }
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
     * <p>Favourite-desk validation against the desk table is deferred until E2.T3 lands;
     * any non-null UUID is accepted and stored as-is until then.
     */
    @Transactional
    public UserResponse updateOwnProfile(AuthPrincipal principal, UpdateOwnProfileRequest request) {
        var user = userRepository
                .findById(principal.userId())
                .orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setDepartment(request.department());
        if (request.preferences() != null) {
            // TODO E2.T3: validate favoriteDeskId against the desk repository before storing.
            user.setFavoriteDeskId(request.preferences().favoriteDeskId());
            user.setDefaultBuilding(request.preferences().defaultBuilding());
            user.setDefaultFloor(request.preferences().defaultFloor());
        }
        log.info("User {} updated own profile", principal.userId());
        return userMapper.toResponse(userRepository.save(user));
    }
}
