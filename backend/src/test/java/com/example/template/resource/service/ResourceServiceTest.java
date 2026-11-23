package com.example.template.resource.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.booking.repository.BookingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceRequest;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.dto.ResourceStatusRequest;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.mapper.ResourceMapper;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.EquipmentRepository;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
    private EquipmentRepository equipmentRepository;

    @Mock
    private FloorRepository floorRepository;

    @Mock
    private BookingRepository bookingRepository;

    private ResourceService resourceService;

    @BeforeEach
    void setUp() {
        resourceService = new ResourceService(
                resourceRepository, equipmentRepository, floorRepository, bookingRepository, new ResourceMapper());
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

        ResourceResponse response = resourceService.create(
                FLOOR_ID, new ResourceRequest("Area 1", type, 1, null, Set.of()));

        assertThat(response.name()).isEqualTo("Area 1");
        assertThat(response.type()).isEqualTo(type);
        assertThat(response.bookable()).isEqualTo(type.isBookable());
    }

    @Test
    @DisplayName("create throws FLOOR_NOT_FOUND when floor does not exist")
    void create_floorNotFound() {
        when(floorRepository.existsById(FLOOR_ID)).thenReturn(false);

        assertThatThrownBy(() -> resourceService.create(
                FLOOR_ID, new ResourceRequest("Booth 1", ResourceType.PHONE_BOOTH, 1, null, Set.of())))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode()).isEqualTo(ErrorCode.FLOOR_NOT_FOUND));
    }

    @Test
    @DisplayName("create throws 400 when desk capacity is not 1")
    void create_deskCapacityMustBeOne() {
        floorExists();
        var badRequest = new ResourceRequest("Desk A", ResourceType.DESK, 2, null, Set.of());

        assertThatThrownBy(() -> resourceService.create(FLOOR_ID, badRequest))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.INVALID_RESOURCE_CAPACITY));

        verify(resourceRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("create throws 400 when meeting room capacity is less than 1")
    void create_meetingRoomCapacityAtLeastOne() {
        floorExists();
        var badRequest = new ResourceRequest("Room A", ResourceType.MEETING_ROOM, 0, null, Set.of());

        assertThatThrownBy(() -> resourceService.create(FLOOR_ID, badRequest))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.INVALID_RESOURCE_CAPACITY));

        verify(resourceRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("create throws 409 when resource name is not unique on the floor (case-insensitive)")
    void create_duplicateName() {
        floorExists();
        when(resourceRepository.existsByFloorIdAndNameIgnoreCase(FLOOR_ID, "Desk 1")).thenReturn(true);
        var request = new ResourceRequest("Desk 1", ResourceType.DESK, 1, null, Set.of());

        assertThatThrownBy(() -> resourceService.create(FLOOR_ID, request))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE));

        verify(resourceRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("create throws 409 when concurrent create hits DataIntegrityViolationException")
    void create_raceConditionThrows409() {
        floorExists();
        when(resourceRepository.existsByFloorIdAndNameIgnoreCase(FLOOR_ID, "Desk 1")).thenReturn(false);
        when(resourceRepository.saveAndFlush(any(Resource.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("duplicate key: uq_resources_name_per_floor"));

        var request = new ResourceRequest("Desk 1", ResourceType.DESK, 1, null, Set.of());
        assertThatThrownBy(() -> resourceService.create(FLOOR_ID, request))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE));
    }

    @Test
    @DisplayName("create throws 400 when equipment ID is unknown")
    void create_unknownEquipmentThrows400() {
        floorExists();
        UUID missingEqId = UUID.randomUUID();
        when(equipmentRepository.findAllById(Set.of(missingEqId))).thenReturn(List.of());

        var request = new ResourceRequest("Desk With Missing Eq", ResourceType.DESK, 1, null, Set.of(missingEqId));
        assertThatThrownBy(() -> resourceService.create(FLOOR_ID, request))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.EQUIPMENT_NOT_FOUND));
    }

    @Test
    @DisplayName("update throws 409 when name is already used by another resource on the floor")
    void update_duplicateNameThrows409() {
        floorExists();
        var entity = resource("Old Name", ResourceType.DESK);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));
        when(resourceRepository.existsByFloorIdAndNameIgnoreCaseAndIdNot(FLOOR_ID, "Taken Name", resourceId))
                .thenReturn(true);

        var request = new ResourceRequest("Taken Name", ResourceType.DESK, 1, null, Set.of());
        assertThatThrownBy(() -> resourceService.update(FLOOR_ID, resourceId, request))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE));
    }

    @Test
    @DisplayName("Search/filter by resource type returns only matching resources")
    void list_filteredByType() {
        floorExists();
        var booth = resource("Phone Booth A", ResourceType.PHONE_BOOTH);
        when(resourceRepository.findByFloorIdWithFilters(FLOOR_ID, ResourceType.PHONE_BOOTH, null))
                .thenReturn(List.of(booth));

        List<ResourceResponse> results = resourceService.list(FLOOR_ID, ResourceType.PHONE_BOOTH, null);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).name()).isEqualTo("Phone Booth A");
        assertThat(results.get(0).type()).isEqualTo(ResourceType.PHONE_BOOTH);
        assertThat(results.get(0).bookable()).isTrue();
    }

    @Test
    @DisplayName("List all returns all resources when filters are null")
    void list_unfiltered() {
        floorExists();
        var desk = resource("Desk 1", ResourceType.DESK);
        var booth = resource("Booth 1", ResourceType.PHONE_BOOTH);
        var spot = resource("Spot 1", ResourceType.PARKING_SPOT);
        var breakRoom = resource("Break Room 1", ResourceType.BREAK_ROOM);
        when(resourceRepository.findByFloorIdWithFilters(FLOOR_ID, null, null))
                .thenReturn(List.of(booth, breakRoom, desk, spot));

        List<ResourceResponse> results = resourceService.list(FLOOR_ID, null, null);

        assertThat(results).hasSize(4);
    }

    @ParameterizedTest
    @EnumSource(value = ResourceType.class, names = {"DESK", "MEETING_ROOM", "PHONE_BOOTH", "PARKING_SPOT"})
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
                FLOOR_ID, resourceId, new ResourceRequest("Spot A1", ResourceType.PARKING_SPOT, 1, null, Set.of()));

        assertThat(response.name()).isEqualTo("Spot A1");
        assertThat(response.type()).isEqualTo(ResourceType.PARKING_SPOT);
        assertThat(response.bookable()).isTrue();
    }

    @Test
    @DisplayName("delete removes resource when no active future bookings exist")
    void delete_removesResource() {
        floorExists();
        var entity = resource("ToDelete", ResourceType.PHONE_BOOTH);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));
        when(bookingRepository.existsByResourceIdAndStatusInAndEndsAtAfter(eq(resourceId), any(), any()))
                .thenReturn(false);

        resourceService.delete(FLOOR_ID, resourceId);

        verify(resourceRepository).delete(entity);
    }

    @Test
    @DisplayName("delete throws 409 RESOURCE_HAS_FUTURE_BOOKINGS when active future bookings exist")
    void delete_throwsConflictWhenFutureBookingsExist() {
        floorExists();
        var entity = resource("WithBookings", ResourceType.DESK);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));
        when(bookingRepository.existsByResourceIdAndStatusInAndEndsAtAfter(eq(resourceId), any(), any()))
                .thenReturn(true);

        assertThatThrownBy(() -> resourceService.delete(FLOOR_ID, resourceId))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode())
                        .isEqualTo(ErrorCode.RESOURCE_HAS_FUTURE_BOOKINGS));

        verify(resourceRepository, never()).delete(any());
    }

    @Test
    @DisplayName("changeStatus updates status and reason")
    void changeStatus_updatesStatusAndReason() {
        floorExists();
        var entity = resource("Desk 1", ResourceType.DESK);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));
        when(resourceRepository.saveAndFlush(any(Resource.class))).thenAnswer(i -> i.getArgument(0));

        ResourceResponse response = resourceService.changeStatus(
                FLOOR_ID, resourceId, new ResourceStatusRequest(ResourceStatus.MAINTENANCE, "Broken leg"));

        assertThat(response.status()).isEqualTo(ResourceStatus.MAINTENANCE);
        assertThat(response.statusReason()).isEqualTo("Broken leg");
    }

    @Test
    @DisplayName("changeStatus clears reason when status is set back to AVAILABLE")
    void changeStatus_clearsReasonOnAvailable() {
        floorExists();
        var entity = resource("Desk 1", ResourceType.DESK);
        entity.setStatus(ResourceStatus.MAINTENANCE);
        entity.setStatusReason("Broken");
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));
        when(resourceRepository.saveAndFlush(any(Resource.class))).thenAnswer(i -> i.getArgument(0));

        ResourceResponse response = resourceService.changeStatus(
                FLOOR_ID, resourceId, new ResourceStatusRequest(ResourceStatus.AVAILABLE, null));

        assertThat(response.status()).isEqualTo(ResourceStatus.AVAILABLE);
        assertThat(response.statusReason()).isNull();
    }

    @Test
    @DisplayName("requireBookable throws RESOURCE_UNAVAILABLE when resource is in MAINTENANCE")
    void requireBookable_throwsWhenInMaintenance() {
        floorExists();
        var entity = resource("Desk 1", ResourceType.DESK);
        entity.setStatus(ResourceStatus.MAINTENANCE);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));

        assertThatThrownBy(() -> resourceService.requireBookable(FLOOR_ID, resourceId, false))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode()).isEqualTo(ErrorCode.RESOURCE_UNAVAILABLE));

        // Even admin cannot book a resource in MAINTENANCE
        assertThatThrownBy(() -> resourceService.requireBookable(FLOOR_ID, resourceId, true))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode()).isEqualTo(ErrorCode.RESOURCE_UNAVAILABLE));
    }

    @Test
    @DisplayName("requireBookable throws RESOURCE_UNAVAILABLE when RESTRICTED for non-admin, but allows admin")
    void requireBookable_restrictedCheck() {
        floorExists();
        var entity = resource("VIP Room", ResourceType.MEETING_ROOM);
        entity.setStatus(ResourceStatus.RESTRICTED);
        UUID resourceId = entity.requireId();
        when(resourceRepository.findByIdAndFloorId(resourceId, FLOOR_ID)).thenReturn(Optional.of(entity));

        // Non-admin rejected
        assertThatThrownBy(() -> resourceService.requireBookable(FLOOR_ID, resourceId, false))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).errorCode()).isEqualTo(ErrorCode.RESOURCE_UNAVAILABLE));

        // Admin allowed
        ResourceResponse response = resourceService.requireBookable(FLOOR_ID, resourceId, true);
        assertThat(response.name()).isEqualTo("VIP Room");
    }
}