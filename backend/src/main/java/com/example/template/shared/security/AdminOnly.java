package com.example.template.shared.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Restricts an endpoint to administrators — the single definition of the admin rule, so every
 * admin controller states it the same way. Non-admins get 403 {@code FORBIDDEN}, anonymous
 * callers 401 {@code UNAUTHORIZED}, both as ProblemDetail. Data scoping inside the service is
 * still the job of {@link ScopeAccessGuard}.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@PreAuthorize("hasRole('ADMIN')")
public @interface AdminOnly {}
