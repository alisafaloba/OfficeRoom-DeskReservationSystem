package com.example.template.user.model;

import com.example.template.shared.model.BaseEntity;
import com.example.template.shared.security.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.jspecify.annotations.Nullable;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User extends BaseEntity {

    @Column(nullable = false, unique = true, length = 320)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Role role;

    /** AES-GCM-encrypted TOTP secret — never stored plaintext, null until 2FA is enrolled. */
    @Column(name = "totp_secret", length = 512)
    private @Nullable String totpSecret;

    @Column(name = "two_factor_enabled", nullable = false)
    private boolean twoFactorEnabled;

    /** Failed passwords and failed 2FA verifications count into this same counter. */
    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "locked_until")
    private @Nullable Instant lockedUntil;

    // ── Personal data ───────────────────────────────────────────────────────────

    @Column(name = "first_name", length = 100)
    private @Nullable String firstName;

    @Column(name = "last_name", length = 100)
    private @Nullable String lastName;

    @Column(name = "department", length = 100)
    private @Nullable String department;

    /**
     * Whether the account is active. False blocks login (E1.T4). Defaults to true so
     * every user created before this column existed remains active.
     */
    @Column(nullable = false)
    private boolean active = true;

    // ── Booking preferences ─────────────────────────────────────────────────────

    /**
     * The user's preferred desk, stored as a plain UUID. Checked against the desk table when the
     * profile is saved, but without a FK constraint: a desk deleted later is not cleared here.
     */
    @Column(name = "favorite_desk_id")
    private @Nullable UUID favoriteDeskId;

    /** The preferred building, or null. Plain id; the database clears it if the building is deleted. */
    @Column(name = "default_building_id")
    private @Nullable UUID defaultBuildingId;

    /** The preferred floor, or null. Plain id; the database clears it if the floor is deleted. */
    @Column(name = "default_floor_id")
    private @Nullable UUID defaultFloorId;
}
