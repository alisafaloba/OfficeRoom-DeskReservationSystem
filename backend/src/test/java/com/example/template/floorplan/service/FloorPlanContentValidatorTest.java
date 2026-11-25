package com.example.template.floorplan.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.template.resource.dto.ResourceType;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("FloorPlanContentValidator")
class FloorPlanContentValidatorTest {

    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final UUID DESK = UUID.randomUUID();
    private static final UUID ROOM = UUID.randomUUID();
    private static final Map<UUID, ResourceType> FLOOR = Map.of(DESK, ResourceType.DESK, ROOM, ResourceType.MEETING_ROOM);

    private static JsonNode json(String text) {
        return JSON.readTree(text.replace('\'', '"'));
    }

    private static void assertRejected(String elements, ErrorCode code) {
        assertThatThrownBy(() -> FloorPlanContentValidator.validate(json(elements), FLOOR))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(code);
    }

    @Test
    void acceptsBoundAndUnboundShapes() {
        String plan = "[{'id':'a','type':'DESK','resourceId':'" + DESK + "','position':{'x':0,'y':0}},"
                + "{'id':'b','type':'ROOM','resourceId':'" + ROOM + "','points':[]},"
                + "{'id':'c','type':'DESK'},{'id':'d','type':'WALL','points':[]},{'id':'e','type':'DESK','resourceId':null}]";
        assertThatCode(() -> FloorPlanContentValidator.validate(json(plan), FLOOR)).doesNotThrowAnyException();
    }

    @Test
    void acceptsAnEmptyPlan() {
        assertThatCode(() -> FloorPlanContentValidator.validate(json("[]"), Map.of())).doesNotThrowAnyException();
    }

    @Test
    void rejectsTheSameResourceOnTwoShapes() {
        assertRejected(
                "[{'id':'a','type':'DESK','resourceId':'" + DESK + "'},{'id':'b','type':'DESK','resourceId':'" + DESK + "'}]",
                ErrorCode.FLOOR_PLAN_RESOURCE_ALREADY_PLACED);
    }

    @Test
    void rejectsAResourceFromAnotherFloor() {
        assertRejected(
                "[{'id':'a','type':'DESK','resourceId':'" + UUID.randomUUID() + "'}]", ErrorCode.FLOOR_PLAN_RESOURCE_INVALID);
    }

    @Test
    void rejectsAResourceOfTheWrongType() {
        assertRejected("[{'id':'a','type':'DESK','resourceId':'" + ROOM + "'}]", ErrorCode.FLOOR_PLAN_RESOURCE_INVALID);
    }

    @Test
    void rejectsABindingOnAShapeThatCannotHaveOne() {
        assertRejected("[{'id':'a','type':'WALL','resourceId':'" + DESK + "'}]", ErrorCode.FLOOR_PLAN_RESOURCE_INVALID);
    }

    @Test
    void rejectsMalformedPlans() {
        assertRejected("{}", ErrorCode.FLOOR_PLAN_INVALID);
        assertRejected("[1]", ErrorCode.FLOOR_PLAN_INVALID);
        assertRejected("[{'type':'DESK'}]", ErrorCode.FLOOR_PLAN_INVALID);
        assertRejected("[{'id':'a','type':'SOFA'}]", ErrorCode.FLOOR_PLAN_INVALID);
        assertRejected("[{'id':'a','type':'DESK'},{'id':'a','type':'DESK'}]", ErrorCode.FLOOR_PLAN_INVALID);
        assertRejected("[{'id':'a','type':'DESK','resourceId':'not-a-uuid'}]", ErrorCode.FLOOR_PLAN_INVALID);
        assertRejected("[{'id':'a','type':'DESK','resourceId':42}]", ErrorCode.FLOOR_PLAN_INVALID);
    }
}
