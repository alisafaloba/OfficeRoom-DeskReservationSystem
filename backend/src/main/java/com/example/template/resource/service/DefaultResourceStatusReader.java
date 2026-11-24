package com.example.template.resource.service;

import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.repository.ResourceRepository;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Resolves unavailable resources based on stored status (MAINTENANCE or RESTRICTED).
 */
@Component
class DefaultResourceStatusReader implements ResourceStatusReader {

    private final ResourceRepository resourceRepository;

    DefaultResourceStatusReader(ResourceRepository resourceRepository) {
        this.resourceRepository = resourceRepository;
    }

    @Override
    public Set<UUID> unavailableAmong(Collection<UUID> resourceIds) {
        if (resourceIds == null || resourceIds.isEmpty()) {
            return Set.of();
        }
        return resourceRepository.findIdsByIdInAndStatusIn(
                resourceIds, Set.of(ResourceStatus.MAINTENANCE, ResourceStatus.RESTRICTED));
    }
}
