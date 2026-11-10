package com.example.template.building.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.building.dto.FloorOrderRequest;
import com.example.template.building.dto.FloorRequest;
import com.example.template.building.dto.FloorResponse;
import com.example.template.building.mapper.FloorMapperImpl;
import com.example.template.building.model.Floor;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("FloorService")
class FloorServiceTest {

    private static final UUID BUILDING_ID = UUID.randomUUID();

    @Mock
    private FloorRepository floorRepository;

    @Mock
    private BuildingRepository buildingRepository;

    private FloorService floorService;

    @BeforeEach
    void setUp() {
        floorService = new FloorService(floorRepository, buildingRepository, new FloorMapperImpl());
    }

    private static Floor floor(String name, int number, int sortOrder) {
        var floor = new Floor(BUILDING_ID);
        floor.setName(name);
        floor.setNumber(number);
        floor.setSortOrder(sortOrder);
        ReflectionTestUtils.setField(floor, "id", UUID.randomUUID());
        return floor;
    }

    private void buildingExists() {
        when(buildingRepository.existsById(BUILDING_ID)).thenReturn(true);
    }

    @Test
    @DisplayName("answers BUILDING_NOT_FOUND for every operation on an unknown building")
    void unknownBuilding_isNotFound() {
        when(buildingRepository.existsById(BUILDING_ID)).thenReturn(false);
        var request = new FloorRequest("Ground", 0);
        var floorId = UUID.randomUUID();

        assertErrorCode(() -> floorService.list(BUILDING_ID), ErrorCode.BUILDING_NOT_FOUND);
        assertErrorCode(() -> floorService.create(BUILDING_ID, request), ErrorCode.BUILDING_NOT_FOUND);
        assertErrorCode(() -> floorService.update(BUILDING_ID, floorId, request), ErrorCode.BUILDING_NOT_FOUND);
        assertErrorCode(() -> floorService.delete(BUILDING_ID, floorId), ErrorCode.BUILDING_NOT_FOUND);
        assertErrorCode(
                () -> floorService.reorder(BUILDING_ID, new FloorOrderRequest(List.of(floorId))),
                ErrorCode.BUILDING_NOT_FOUND);
    }

    @Test
    @DisplayName("creates a floor at the end of the display order with a stripped name")
    void create_appendsToTheEnd() {
        buildingExists();
        when(floorRepository.nextSortOrder(BUILDING_ID)).thenReturn(3);
        when(floorRepository.saveAndFlush(any(Floor.class))).thenAnswer(invocation -> {
            Floor saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());
            return saved;
        });

        FloorResponse response = floorService.create(BUILDING_ID, new FloorRequest("  Second floor ", 2));

        assertThat(response.name()).isEqualTo("Second floor");
        assertThat(response.number()).isEqualTo(2);
        assertThat(response.sortOrder()).isEqualTo(3);
        assertThat(response.buildingId()).isEqualTo(BUILDING_ID);
    }

    @Test
    @DisplayName("rejects a floor number the building already uses")
    void create_duplicateNumber_isConflict() {
        buildingExists();
        when(floorRepository.existsByBuildingIdAndNumber(BUILDING_ID, 1)).thenReturn(true);

        assertErrorCode(
                () -> floorService.create(BUILDING_ID, new FloorRequest("First", 1)),
                ErrorCode.FLOOR_NUMBER_ALREADY_IN_USE);
        verify(floorRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("turns a unique-constraint race on the number into a 409, not a 500")
    void create_concurrentDuplicate_isConflict() {
        buildingExists();
        when(floorRepository.saveAndFlush(any(Floor.class))).thenThrow(new DataIntegrityViolationException("dup"));

        assertErrorCode(
                () -> floorService.create(BUILDING_ID, new FloorRequest("First", 1)),
                ErrorCode.FLOOR_NUMBER_ALREADY_IN_USE);
    }

    @Test
    @DisplayName("lets a floor keep its own number on update but not take another floor's")
    void update_numberConflictsOnlyWithOtherFloors() {
        buildingExists();
        var first = floor("First", 1, 0);
        when(floorRepository.findByIdAndBuildingId(first.requireId(), BUILDING_ID)).thenReturn(Optional.of(first));
        when(floorRepository.existsByBuildingIdAndNumberAndIdNot(BUILDING_ID, 1, first.requireId()))
                .thenReturn(false);
        when(floorRepository.existsByBuildingIdAndNumberAndIdNot(BUILDING_ID, 2, first.requireId()))
                .thenReturn(true);
        when(floorRepository.saveAndFlush(first)).thenReturn(first);

        var renamed = floorService.update(BUILDING_ID, first.requireId(), new FloorRequest("Mezzanine", 1));

        assertThat(renamed.name()).isEqualTo("Mezzanine");
        assertErrorCode(
                () -> floorService.update(BUILDING_ID, first.requireId(), new FloorRequest("First", 2)),
                ErrorCode.FLOOR_NUMBER_ALREADY_IN_USE);
    }

    @Test
    @DisplayName("answers FLOOR_NOT_FOUND for a floor of another building")
    void floorOfAnotherBuilding_isNotFound() {
        buildingExists();
        var floorId = UUID.randomUUID();
        when(floorRepository.findByIdAndBuildingId(floorId, BUILDING_ID)).thenReturn(Optional.empty());

        assertErrorCode(() -> floorService.getById(BUILDING_ID, floorId), ErrorCode.FLOOR_NOT_FOUND);
        assertErrorCode(() -> floorService.delete(BUILDING_ID, floorId), ErrorCode.FLOOR_NOT_FOUND);
    }

    @Test
    @DisplayName("stores the dragged order as positions 0, 1, 2 …")
    void reorder_assignsPositionsInListOrder() {
        buildingExists();
        var ground = floor("Ground", 0, 0);
        var first = floor("First", 1, 1);
        var second = floor("Second", 2, 2);
        when(floorRepository.findByBuildingIdOrderBySortOrderAscNumberAsc(BUILDING_ID))
                .thenReturn(List.of(ground, first, second))
                .thenReturn(List.of(second, ground, first));

        var result = floorService.reorder(
                BUILDING_ID, new FloorOrderRequest(List.of(second.requireId(), ground.requireId(), first.requireId())));

        assertThat(second.getSortOrder()).isZero();
        assertThat(ground.getSortOrder()).isEqualTo(1);
        assertThat(first.getSortOrder()).isEqualTo(2);
        assertThat(result).extracting(FloorResponse::name).containsExactly("Second", "Ground", "First");
        verify(floorRepository).flush();
    }

    @Test
    @DisplayName("rejects an order that misses a floor, names a foreign one or is from an outdated page")
    void reorder_mismatchedSet_isOutdated() {
        buildingExists();
        var ground = floor("Ground", 0, 0);
        var first = floor("First", 1, 1);
        when(floorRepository.findByBuildingIdOrderBySortOrderAscNumberAsc(BUILDING_ID))
                .thenReturn(List.of(ground, first));

        var missing = new FloorOrderRequest(List.of(ground.requireId()));
        var foreign = new FloorOrderRequest(List.of(ground.requireId(), UUID.randomUUID()));

        assertErrorCode(() -> floorService.reorder(BUILDING_ID, missing), ErrorCode.FLOOR_ORDER_OUTDATED);
        assertErrorCode(() -> floorService.reorder(BUILDING_ID, foreign), ErrorCode.FLOOR_ORDER_OUTDATED);
        assertThat(ground.getSortOrder()).isZero();
        assertThat(first.getSortOrder()).isEqualTo(1);
        verify(floorRepository, never()).flush();
    }

    @Test
    @DisplayName("rejects an order that names the same floor twice as invalid input")
    void reorder_duplicateId_isValidationFailure() {
        buildingExists();
        var id = UUID.randomUUID();

        assertErrorCode(
                () -> floorService.reorder(BUILDING_ID, new FloorOrderRequest(List.of(id, id))),
                ErrorCode.VALIDATION_FAILED);
    }

    private static void assertErrorCode(Runnable call, ErrorCode expected) {
        assertThatThrownBy(call::run)
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(expected);
    }
}
