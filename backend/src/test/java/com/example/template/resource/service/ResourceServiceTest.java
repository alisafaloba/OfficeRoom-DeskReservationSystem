package com.example.template.resource.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceRequest;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.mapper.ResourceMapper;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("ResourceService")
class ResourceServiceTest {

    private static final UUID FLOOR_ID = UUID.randomUUID();

    @Mock
    private ResourceRepository resourceRepository;

    @Mock
    private FloorRepository floorRepository;

    private ResourceService resourceService;

    @BeforeEach
    void setUp() {
        resourceService = new ResourceService(resourceRepository, floorRepository, new ResourceMapper());
    }

    private static Resource resource(String name, ResourceType type) {
        var resource = new Resource(FLOOR_ID);
        resource.setName(name);
        resource.setType(type);
        ReflectionTestUtils.setField(resource, "id", UUID.randomUUID());
        return resource;
    }

    private void floorExists() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(true);
    }

    @ParameterizedTest
    @EnumSource(ResourceType.class)
    @DisplayName("Admin creates a resource picking any of the resource types")
    void create_supportsAllTypes(ResourceType type) {
        floorExists();
        when(resourceRepository.saveAndFlush(any(Resource.class)))
                .thenAnswer(invocation -> {
                    Resource r = invocation.getArgument(0);
                    ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
                    return r;
                });

        ResourceResponse response = resourceService.create(FLOOR_ID, new ResourceRequest("Area 1", type));

        assertThat(response.name()).isEqualTo("Area 1");
        assertThat(response.type()).isEqualTo(type);
        assertThat(response.bookable()).isEqualTo(type.isBookable());
    }

    @Test
    @DisplayName("create throws FLOOR_NOT_FOUND when floor does not exist")
    void create_floorNotFound() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(false);

        assertThatThrownBy(() -> resourceService.create(FLOOR_ID, new ResourceRequest("Booth 1", ResourceType.PHONE_BOOTH)))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode()).isEqualTo(ErrorCode.FLOOR_NOT_FOUND));
    }

    @Test
    @DisplayName("Search/filter by resource type returns only matching resources")
    void list_filteredByType() {
        floorExists();
        var booth = resource("Phone Booth A", ResourceType.PHONE_BOOTH);
        when(resourceRepository.findByFloorIdAndTypeOrderByNameAsc(FLOOR_ID, ResourceType.PHONE_BOOTH))
                .thenReturn(List.of(booth));

        List<ResourceResponse> results = resourceService.list(FLOOR_ID, ResourceType.PHONE_BOOTH);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).name()).isEqualTo("Phone Booth A");
        assertThat(results.get(0).type()).isEqualTo(ResourceType.PHONE_BOOTH);
        assertThat(results.get(0).bookable()).isTrue();
    }

    @Test
    @DisplayName("List all returns all resources when type filter is null")
    void list_unfiltered() {
        floorExists();
        var desk = resource("Desk 1", ResourceType.DESK);
        var booth = resource("Booth 1", ResourceType.PHONE_BOOTH);
        var spot = resource("Spot 1", ResourceType.PARKING_SPOT);
        var breakRoom = resource("Break Room 1", ResourceType.BREAK_ROOM);
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID))
                .thenReturn(List.of(booth, breakRoom, desk, spot));

        List<ResourceResponse> results = resourceService.list(FLOOR_ID, null);

        assertThat(results).hasSize(4);
    }

    @ParameterizedTest
    @EnumSource(value = ResourceType.class, names = {"DESK", "PHONE_BOOTH", "PARKING_SPOT"})
    @DisplayName("Bookable types succeed when checking bookable status (for E5.T3 booking flow)")
    void requireBookable_succeedsForBookableTypes(ResourceType bookableType) {
        floorExists();
        var entity = resource("Item 1", bookableType);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));

        ResourceResponse response = resourceService.requireBookable(FLOOR_ID, resourceId);

        assertThat(response.id()).isEqualTo(resourceId);
        assertThat(response.bookable()).isTrue();
    }

    @Test
    @DisplayName("Non-bookable types (break room) throw RESOURCE_NOT_BOOKABLE (400) when booking is attempted")
    void requireBookable_throws400ForNonBookableType() {
        floorExists();
        var breakRoom = resource("Lounge", ResourceType.BREAK_ROOM);
        UUID resourceId = breakRoom.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(breakRoom));

        assertThatThrownBy(() -> resourceService.requireBookable(FLOOR_ID, resourceId))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    var apiException = (ApiException) e;
                    assertThat(apiException.errorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_BOOKABLE);
                    assertThat(apiException.errorCode().status().value()).isEqualTo(400);
                });
    }

    @Test
    @DisplayName("update modifies name and type")
    void update_updatesProperties() {
        floorExists();
        var entity = resource("Old Name", ResourceType.DESK);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));
        when(resourceRepository.saveAndFlush(any(Resource.class))).thenAnswer(i -> i.getArgument(0));

        ResourceResponse response = resourceService.update(
                FLOOR_ID, resourceId, new ResourceRequest("Spot A1", ResourceType.PARKING_SPOT));

        assertThat(response.name()).isEqualTo("Spot A1");
        assertThat(response.type()).isEqualTo(ResourceType.PARKING_SPOT);
        assertThat(response.bookable()).isTrue();
    }

    @Test
    @DisplayName("delete removes resource")
    void delete_removesResource() {
        floorExists();
        var entity = resource("ToDelete", ResourceType.PHONE_BOOTH);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));

        resourceService.delete(FLOOR_ID, resourceId);

        verify(resourceRepository).delete(entity);
    }
}
