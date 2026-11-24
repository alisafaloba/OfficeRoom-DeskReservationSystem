package com.example.template.floorplan.service;

import com.example.template.resource.dto.ResourceType;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * Checks the element list of a plan before it is stored. Pure: it gets the floor's resources
 * passed in, so it can be tested without a database.
 *
 * <p>Rules: the list is an array of at most {@link #MAX_ELEMENTS} objects; each has a unique
 * non-blank {@code id} and a known {@code type}; a {@code resourceId}, when present, is only on a
 * shape that can be bound, names a resource of this floor whose type fits the shape, and appears
 * at most once in the plan (E3.T4).
 */
final class FloorPlanContentValidator {

    /** Several hundred elements is the target (E3.T7); this leaves headroom without being unbounded. */
    static final int MAX_ELEMENTS = 5000;

    /**
     * Upper bound for the stored JSON, in characters. MAX_ELEMENTS caps how many elements there
     * are; this caps how big they get (long labels, polygons with huge point lists). 2 MB is far
     * above a real floor of a few hundred elements, which is some tens of KB.
     */
    static final int MAX_CONTENT_CHARS = 2_000_000;

    /** Which resource type each bindable shape type takes. Shapes not listed here never carry a resource. */
    static final Map<String, ResourceType> BINDABLE = Map.of(
            "DESK", ResourceType.DESK,
            "ROOM", ResourceType.MEETING_ROOM,
            "PHONE_BOOTH", ResourceType.PHONE_BOOTH,
            "PARKING_SPOT", ResourceType.PARKING_SPOT,
            "BREAK_ROOM", ResourceType.BREAK_ROOM);

    static final Set<String> ELEMENT_TYPES = Set.of(
            "WALL", "OUTLINE", "ZONE", "ROOM", "DESK", "DECOR", "PHONE_BOOTH", "PARKING_SPOT", "BREAK_ROOM");

    private FloorPlanContentValidator() {}

    /**
     * @param floorResources every resource of the floor, by id
     * @throws ApiException {@code FLOOR_PLAN_INVALID}, {@code FLOOR_PLAN_RESOURCE_INVALID} or
     *     {@code FLOOR_PLAN_RESOURCE_ALREADY_PLACED}
     */
    static void validate(JsonNode elements, Map<UUID, ResourceType> floorResources) {
        if (!elements.isArray()) {
            throw invalid("elements must be an array");
        }
        if (elements.size() > MAX_ELEMENTS) {
            throw invalid("a plan holds at most " + MAX_ELEMENTS + " elements");
        }
        Set<String> ids = new HashSet<>();
        Set<UUID> placed = new HashSet<>();
        for (int i = 0; i < elements.size(); i++) {
            JsonNode element = elements.get(i);
            if (element == null || !element.isObject()) {
                throw invalid("element " + i + " is not an object");
            }
            String id = text(element, "id");
            if (id == null || id.isBlank()) {
                throw invalid("element " + i + " has no id");
            }
            if (!ids.add(id)) {
                throw invalid("element id " + id + " is used twice");
            }
            String type = text(element, "type");
            if (type == null || !ELEMENT_TYPES.contains(type)) {
                throw invalid("element " + id + " has an unknown type");
            }
            UUID resourceId = resourceIdOf(element, id);
            if (resourceId == null) {
                continue;
            }
            ResourceType expected = BINDABLE.get(type);
            if (expected == null) {
                throw new ApiException(
                        ErrorCode.FLOOR_PLAN_RESOURCE_INVALID, "a " + type + " element cannot be bound to a resource");
            }
            ResourceType actual = floorResources.get(resourceId);
            if (actual == null) {
                throw new ApiException(
                        ErrorCode.FLOOR_PLAN_RESOURCE_INVALID, "resource " + resourceId + " is not on this floor");
            }
            if (actual != expected) {
                throw new ApiException(
                        ErrorCode.FLOOR_PLAN_RESOURCE_INVALID,
                        "resource " + resourceId + " is a " + actual + " and cannot be bound to a " + type);
            }
            if (!placed.add(resourceId)) {
                throw new ApiException(
                        ErrorCode.FLOOR_PLAN_RESOURCE_ALREADY_PLACED,
                        "resource " + resourceId + " is bound to more than one shape");
            }
        }
    }

    /** @throws ApiException {@code FLOOR_PLAN_INVALID} when the serialized plan is too large */
    static void validateSize(String content) {
        if (content.length() > MAX_CONTENT_CHARS) {
            throw invalid("the plan is larger than " + MAX_CONTENT_CHARS + " characters");
        }
    }

    /** The element's resource id; null when absent or JSON null. */
    static @Nullable UUID resourceIdOf(JsonNode element, String elementId) {
        JsonNode value = element.get("resourceId");
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            throw invalid("element " + elementId + " has a malformed resourceId");
        }
        try {
            return UUID.fromString(value.asString());
        } catch (IllegalArgumentException e) {
            throw invalid("element " + elementId + " has a malformed resourceId");
        }
    }

    private static @Nullable String text(JsonNode element, String field) {
        JsonNode value = element.get(field);
        return value != null && value.isString() ? value.asString() : null;
    }

    private static ApiException invalid(String detail) {
        return new ApiException(ErrorCode.FLOOR_PLAN_INVALID, detail);
    }
}
