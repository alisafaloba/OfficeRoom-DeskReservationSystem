package com.example.template.floorplan.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.template.building.repository.FloorRepository;
import com.example.template.floorplan.dto.FloorPlanRequest;
import com.example.template.floorplan.model.FloorPlan;
import com.example.template.floorplan.repository.FloorPlanRepository;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("FloorPlanService")
class FloorPlanServiceTest {

    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final UUID FLOOR_ID = UUID.randomUUID();
    private static final UUID ADMIN_ID = UUID.randomUUID();

    @Mock
    private FloorPlanRepository floorPlanRepository;

    @Mock
    private FloorRepository floorRepository;

    @Mock
    private ResourceRepository resourceRepository;

    private FloorPlanService service;
    private Resource desk;

    @BeforeEach
    void setUp() {
        service = new FloorPlanService(floorPlanRepository, floorRepository, resourceRepository, JSON);
        lenient().when(floorRepository.existsById(FLOOR_ID)).thenReturn(true);
        desk = new Resource(FLOOR_ID);
        desk.setName("Desk 1");
        desk.setType(ResourceType.DESK);
        ReflectionTestUtils.setField(desk, "id", UUID.randomUUID());
    }

    private static JsonNode json(String text) {
        return JSON.readTree(text.replace('\'', '"'));
    }

    private FloorPlan stored(long version, String content) {
        var plan = new FloorPlan(FLOOR_ID);
        plan.setSchemaVersion(1);
        plan.setContent(content.replace('\'', '"'));
        ReflectionTestUtils.setField(plan, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(plan, "version", version);
        return plan;
    }

    @Test
    void answersAnEmptyPlanWhenNoneWasSaved() {
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());

        var plan = service.get(FLOOR_ID);

        assertThat(plan.version()).isNull();
        assertThat(plan.elements().isArray()).isTrue();
        assertThat(plan.elements().size()).isZero();
    }

    @Test
    void loadDropsBindingsToResourcesThatNoLongerExist() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of(desk));
        String gone = UUID.randomUUID().toString();
        when(floorPlanRepository.findByFloorId(FLOOR_ID))
                .thenReturn(Optional.of(stored(3, "[{'id':'a','type':'DESK','resourceId':'" + desk.requireId()
                        + "'},{'id':'b','type':'DESK','resourceId':'" + gone + "'}]")));

        var plan = service.get(FLOOR_ID);

        assertThat(plan.version()).isEqualTo(3L);
        assertThat(plan.elements().get(0).get("resourceId").asString()).isEqualTo(desk.requireId().toString());
        assertThat(plan.elements().get(1).has("resourceId")).isFalse();
    }

    @Test
    void firstSaveStoresThePlan() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of(desk));
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        when(floorPlanRepository.saveAndFlush(any())).thenAnswer(call -> {
            FloorPlan plan = call.getArgument(0);
            ReflectionTestUtils.setField(plan, "version", 0L);
            return plan;
        });
        var elements = json("[{'id':'a','type':'DESK','resourceId':'" + desk.requireId() + "'}]");

        var saved = service.save(FLOOR_ID, new FloorPlanRequest(null, 1, elements), ADMIN_ID);

        assertThat(saved.version()).isZero();
        assertThat(saved.updatedBy()).isEqualTo(ADMIN_ID);
        var captor = ArgumentCaptor.forClass(FloorPlan.class);
        verify(floorPlanRepository).saveAndFlush(captor.capture());
        assertThat(JSON.readTree(captor.getValue().getContent())).isEqualTo(elements);
        assertThat(captor.getValue().getFloorId()).isEqualTo(FLOOR_ID);
    }

    @Test
    void rejectsASaveBasedOnAnOutdatedVersion() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of());
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.of(stored(4, "[]")));

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(3L, 1, json("[]")), ADMIN_ID))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_PLAN_OUTDATED);
        verify(floorPlanRepository, never()).saveAndFlush(any());
    }

    @Test
    void rejectsAFirstSaveWhenSomeoneAlreadySaved() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of());
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.of(stored(0, "[]")));

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(null, 1, json("[]")), ADMIN_ID))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_PLAN_OUTDATED);
    }

    @Test
    void rejectsDuplicateBindingsBeforeTouchingTheStoredPlan() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of(desk));
        var elements = json("[{'id':'a','type':'DESK','resourceId':'" + desk.requireId()
                + "'},{'id':'b','type':'DESK','resourceId':'" + desk.requireId() + "'}]");

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(null, 1, elements), ADMIN_ID))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_PLAN_RESOURCE_ALREADY_PLACED);
        verify(floorPlanRepository, never()).saveAndFlush(any());
    }

    @Test
    void aSaveThatLosesTheVersionRaceIsOutdated() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of());
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.of(stored(4, "[]")));
        when(floorPlanRepository.saveAndFlush(any()))
                .thenThrow(new ObjectOptimisticLockingFailureException(FloorPlan.class, UUID.randomUUID()));

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(4L, 1, json("[]")), ADMIN_ID))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_PLAN_OUTDATED);
    }

    @Test
    void parallelFirstSavesAreOutdated() {
        stubFirstSaveViolating("duplicate key value violates unique constraint \"uq_floor_plans_floor\"");

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(null, 1, json("[]")), ADMIN_ID))
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_PLAN_OUTDATED);
    }

    @Test
    void aFloorDeletedDuringTheSaveIsNotFound() {
        stubFirstSaveViolating("insert or update on table \"floor_plans\" violates foreign key constraint \"fk_floor_plans_floor\"");

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(null, 1, json("[]")), ADMIN_ID))
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_NOT_FOUND);
    }

    @Test
    void anyOtherViolationIsRethrown() {
        stubFirstSaveViolating("value too long for type character varying");

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(null, 1, json("[]")), ADMIN_ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsAnOversizedPlan() {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of());
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        String label = "x".repeat(FloorPlanContentValidator.MAX_CONTENT_CHARS);
        var elements = json("[{'id':'z','type':'ZONE','points':[],'label':'" + label + "'}]");

        assertThatThrownBy(() -> service.save(FLOOR_ID, new FloorPlanRequest(null, 1, elements), ADMIN_ID))
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_PLAN_INVALID);
        verify(floorPlanRepository, never()).saveAndFlush(any());
    }

    private void stubFirstSaveViolating(String databaseMessage) {
        when(resourceRepository.findByFloorIdOrderByNameAsc(FLOOR_ID)).thenReturn(List.of());
        when(floorPlanRepository.findByFloorId(FLOOR_ID)).thenReturn(Optional.empty());
        when(floorPlanRepository.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("save failed", new SQLException(databaseMessage)));
    }

    @Test
    void unknownFloorIsNotFound() {
        UUID other = UUID.randomUUID();
        when(floorRepository.existsById(other)).thenReturn(false);

        assertThatThrownBy(() -> service.get(other))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.FLOOR_NOT_FOUND);
    }

    @Test
    void staleBindingFilterDropsBindingsOfTheWrongTypeWithoutChangingTheInput() {
        var elements = json("[{'id':'a','type':'ROOM','resourceId':'" + desk.requireId() + "'}]");

        var cleaned = FloorPlanService.withoutStaleBindings(elements, Map.of(desk.requireId(), ResourceType.DESK));

        assertThat(cleaned.get(0).has("resourceId")).isFalse();
        assertThat(elements.get(0).has("resourceId")).as("the input is not changed").isTrue();
    }
}
