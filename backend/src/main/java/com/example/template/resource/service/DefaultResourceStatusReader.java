package com.example.template.resource.service;

import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.repository.ResourceRepository;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Answers from the stored status: MAINTENANCE for everyone, RESTRICTED for non-admins. */
@Component
class DefaultResourceStatusReader implements ResourceStatusReader {

    private final ResourceRepository resourceRepository;

    DefaultResourceStatusReader(ResourceRepository resourceRepository) {
        this.resourceRepository = resourceRepository;
    }

    @Override
    public Set<UUID> unavailableAmong(Collection<UUID> resourceIds, boolean viewerIsAdmin) {
        if (resourceIds == null || resourceIds.isEmpty()) {
            return Set.of();
        }
        Set<ResourceStatus> statuses = viewerIsAdmin
                ? Set.of(ResourceStatus.MAINTENANCE)
                : Set.of(ResourceStatus.MAINTENANCE, ResourceStatus.RESTRICTED);
        return resourceRepository.findIdsByIdInAndStatusIn(resourceIds, statuses);
    }
}
