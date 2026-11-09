package com.example.template.user.event;

import java.util.UUID;

/**
 * Published inside the transaction that changes a user's role or active state: the auth
 * feature reacts by revoking that user's sessions, so the change cannot be outlived by
 * a refresh token.
 */
public record UserAccessChangedEvent(UUID userId) {}