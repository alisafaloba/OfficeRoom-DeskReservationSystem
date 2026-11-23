package com.example.template.resource.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.repository.ResourceRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("DefaultResourceStatusReader")
class DefaultResourceStatusReaderTest {

    @Mock
    private ResourceRepository resourceRepository;

    @InjectMocks
    private DefaultResourceStatusReader reader;

    @Test
    void returnsEmptyWhenInputIsEmpty() {
        Set<UUID> result = reader.unavailableAmong(List.of());
        assertThat(result).isEmpty();
        verifyNoInteractions(resourceRepository);
    }

    @Test
    void queriesRepositoryForMaintenanceAndRestrictedResources() {
        UUID res1 = UUID.randomUUID();
        UUID res2 = UUID.randomUUID();
        when(resourceRepository.findIdsByIdInAndStatusIn(
                eq(List.of(res1, res2)),
                eq(Set.of(ResourceStatus.MAINTENANCE, ResourceStatus.RESTRICTED))))
                .thenReturn(Set.of(res1));

        Set<UUID> unavailable = reader.unavailableAmong(List.of(res1, res2));

        assertThat(unavailable).containsExactly(res1);
    }
}
