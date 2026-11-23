package com.example.template.resource.service;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Every resource counts as AVAILABLE until the resource status exists.
 *
 * <p>TODO(E2.T4): answer from the stored status, e.g. the ids among {@code resourceIds} whose
 * status is MAINTENANCE or RESTRICTED, in one query.
 */
@Component
class DefaultResourceStatusReader implements ResourceStatusReader {

    @Override
    public Set<UUID> unavailableAmong(Collection<UUID> resourceIds) {
        return Set.of();
    }
}
