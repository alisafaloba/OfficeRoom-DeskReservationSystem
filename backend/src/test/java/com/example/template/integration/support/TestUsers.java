package com.example.template.integration.support;

import java.util.UUID;

/**
 * Mirrors the YAML fixtures under {@code datasets/}. Every value here exists in exactly one
 * dataset — fixtures are per test class, never shared, so classes cannot break each other.
 * The catalog stays complete (both id and email of every row) even where a constant has no
 * caller yet, so new tests never fall back to literals.
 */
@SuppressWarnings("unused")
public final class TestUsers {

    /** Raw password behind every fixture {@code password_hash}. */
    public static final String PASSWORD = "Password123!";

    // datasets/auth-users.yml
    public static final UUID AUTH_USER_ID = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    public static final String AUTH_USER_EMAIL = "auth-user@test.local";
    public static final UUID AUTH_2FA_USER_ID = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000002");
    public static final String AUTH_2FA_USER_EMAIL = "auth-2fa@test.local";
    public static final UUID AUTH_LOCKED_USER_ID = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000003");
    public static final String AUTH_LOCKED_USER_EMAIL = "auth-locked@test.local";

    // datasets/user-users.yml
    public static final UUID ADMIN_ID = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000001");
    public static final String ADMIN_EMAIL = "users-admin@test.local";
    public static final UUID USER_A_ID = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");
    public static final String USER_A_EMAIL = "users-a@test.local";
    public static final UUID USER_B_ID = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000003");
    public static final String USER_B_EMAIL = "users-b@test.local";

    // datasets/admin-authorization-users.yml
    public static final UUID AUTHZ_ADMIN_ID = UUID.fromString("cccccccc-0000-0000-0000-000000000001");
    public static final String AUTHZ_ADMIN_EMAIL = "authz-admin@test.local";
    public static final UUID AUTHZ_EMPLOYEE_ID = UUID.fromString("cccccccc-0000-0000-0000-000000000002");
    public static final String AUTHZ_EMPLOYEE_EMAIL = "authz-employee@test.local";

    // datasets/building-users.yml
    public static final UUID BUILDING_ADMIN_ID = UUID.fromString("dddddddd-0000-0000-0000-000000000001");
    public static final String BUILDING_ADMIN_EMAIL = "buildings-admin@test.local";
    public static final UUID BUILDING_EMPLOYEE_ID = UUID.fromString("dddddddd-0000-0000-0000-000000000002");
    public static final String BUILDING_EMPLOYEE_EMAIL = "buildings-employee@test.local";

    // datasets/floor-users.yml
    public static final UUID FLOOR_ADMIN_ID = UUID.fromString("ffffffff-0000-0000-0000-000000000001");
    public static final String FLOOR_ADMIN_EMAIL = "floors-admin@test.local";
    public static final UUID FLOOR_EMPLOYEE_ID = UUID.fromString("ffffffff-0000-0000-0000-000000000002");
    public static final String FLOOR_EMPLOYEE_EMAIL = "floors-employee@test.local";

    // datasets/availability-users.yml
    public static final UUID AVAILABILITY_ADMIN_ID = UUID.fromString("a1a1a1a1-0000-0000-0000-000000000001");
    public static final String AVAILABILITY_ADMIN_EMAIL = "availability-admin@test.local";
    public static final UUID AVAILABILITY_ME_ID = UUID.fromString("a1a1a1a1-0000-0000-0000-000000000002");
    public static final String AVAILABILITY_ME_EMAIL = "availability-me@test.local";
    public static final UUID AVAILABILITY_COLLEAGUE_ID = UUID.fromString("a1a1a1a1-0000-0000-0000-000000000003");
    public static final String AVAILABILITY_COLLEAGUE_EMAIL = "availability-colleague@test.local";

    // datasets/floor-background-users.yml
    public static final UUID BACKGROUND_ADMIN_ID = UUID.fromString("b9b9b9b9-0000-0000-0000-000000000001");
    public static final String BACKGROUND_ADMIN_EMAIL = "background-admin@test.local";
    public static final UUID BACKGROUND_EMPLOYEE_ID = UUID.fromString("b9b9b9b9-0000-0000-0000-000000000002");
    public static final String BACKGROUND_EMPLOYEE_EMAIL = "background-employee@test.local";

    private TestUsers() {}
}
