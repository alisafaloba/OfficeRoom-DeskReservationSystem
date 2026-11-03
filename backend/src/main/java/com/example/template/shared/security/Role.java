package com.example.template.shared.security;

/**
 * The closed set of roles, matching the two roles of the specification. Every switch over this
 * enum (ScopeAccessGuard, LoginResult handling) is exhaustive on purpose — adding a role must
 * fail compilation in every guard. The values are also pinned by the {@code ck_users_role}
 * database constraint.
 */
public enum Role {
    /** Administrator: manages users, space and every booking. */
    ADMIN,
    /** Employee: browses floor plans and manages their own bookings. */
    USER
}
