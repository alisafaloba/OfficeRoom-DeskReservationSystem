package com.example.template.building.service;

import com.example.template.building.dto.ResourceRequest;
import com.example.template.building.mapper.ResourceMapper;
import com.example.template.building.model.Resource;
import com.example.template.building.model.Resource.ResourceType;
import com.example.template.building.repository.EquipmentRepository;
import com.example.template.building.repository.ResourceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ResourceServiceTest {

    @Mock
    private ResourceRepository resourceRepository;

    @Mock
    private EquipmentRepository equipmentRepository;

    @Mock
    private ResourceMapper resourceMapper;

    @InjectMocks
    private ResourceService resourceService;

    @Test
    void createResource_ShouldThrowException_WhenDeskCapacityIsNotOne() {
        // Arrange
        UUID floorId = UUID.randomUUID();
        // Capacitate incorectă pentru birou (2)
        ResourceRequest badRequest = new ResourceRequest(ResourceType.DESK, "Birou A", 2, "Test", Set.of());

        // Act & Assert
        assertThatThrownBy(() -> resourceService.createResource(floorId, badRequest))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("A desk always has capacity 1");

        // Verificăm că nu s-a apelat baza de date
        verify(resourceRepository, never()).save(any());
    }

    @Test
    void createResource_ShouldThrowException_WhenMeetingRoomCapacityIsLessThanOne() {
        // Arrange
        UUID floorId = UUID.randomUUID();
        // Capacitate incorectă pentru sală (0)
        ResourceRequest badRequest = new ResourceRequest(ResourceType.MEETING_ROOM, "Sala A", 0, "Test", Set.of());

        // Act & Assert
        assertThatThrownBy(() -> resourceService.createResource(floorId, badRequest))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("A meeting room needs a capacity of at least 1");

        verify(resourceRepository, never()).save(any());
    }

    @Test
    void createResource_ShouldThrowException_WhenLabelIsNotUnique() {
        // Arrange
        UUID floorId = UUID.randomUUID();
        ResourceRequest request = new ResourceRequest(ResourceType.DESK, "Birou Existent", 1, "Test", Set.of());

        // Simulăm că baza de date găsește deja acest nume pe etajul respectiv
        when(resourceRepository.existsByFloorIdAndLabel(floorId, "Birou Existent")).thenReturn(true);

        // Act & Assert
        assertThatThrownBy(() -> resourceService.createResource(floorId, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Label is not unique on this floor");

        verify(resourceRepository, never()).save(any());
    }

    @Test
    void createResource_ShouldSaveSuccessfully_WhenValid() {
        // Arrange
        UUID floorId = UUID.randomUUID();
        ResourceRequest validRequest = new ResourceRequest(ResourceType.MEETING_ROOM, "Sala B", 10, "Test", Set.of());

        when(resourceRepository.existsByFloorIdAndLabel(floorId, "Sala B")).thenReturn(false);

        Resource savedResource = new Resource(floorId);
        savedResource.setLabel("Sala B");
        when(resourceRepository.save(any(Resource.class))).thenReturn(savedResource);

        // Act
        Resource result = resourceService.createResource(floorId, validRequest);

        // Assert
        assertThat(result).isNotNull();
        assertThat(result.getLabel()).isEqualTo("Sala B");

        // Verificăm că metoda de mapare și cea de salvare au fost apelate
        verify(resourceMapper, times(1)).updateEntityFromRequest(eq(validRequest), any(Resource.class));
        verify(resourceRepository, times(1)).save(any(Resource.class));
    }

    @Test
    void updateResource_ShouldThrowException_WhenLabelIsNotUnique() {
        // Arrange
        UUID floorId = UUID.randomUUID();
        UUID resourceId = UUID.randomUUID();
        ResourceRequest request = new ResourceRequest(ResourceType.MEETING_ROOM, "Nume Duplicat", 5, "", Set.of());

        // Simulăm că un ALT obiect are deja acest nume
        when(resourceRepository.existsByFloorIdAndLabelAndIdNot(floorId, "Nume Duplicat", resourceId)).thenReturn(true);

        // Act & Assert
        assertThatThrownBy(() -> resourceService.updateResource(floorId, resourceId, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Label is not unique on this floor");

        verify(resourceRepository, never()).save(any());
    }
}