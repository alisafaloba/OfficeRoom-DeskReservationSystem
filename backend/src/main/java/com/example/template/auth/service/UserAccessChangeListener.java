package com.example.template.auth.service;

import com.example.template.user.event.UserAccessChangedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Revokes all refresh tokens of a user whose role or active state just changed. Runs
 * synchronously inside the changing transaction (MANDATORY), so both commit or roll back together.
 */
@Component
public class UserAccessChangeListener {

    private final SessionRevoker sessionRevoker;

    public UserAccessChangeListener(SessionRevoker sessionRevoker) {
        this.sessionRevoker = sessionRevoker;
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void onUserAccessChanged(UserAccessChangedEvent event) {
        sessionRevoker.revokeAllForUser(event.userId());
    }
}