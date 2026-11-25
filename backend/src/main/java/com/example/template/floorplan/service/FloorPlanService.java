package com.example.template.floorplan.service;

import com.example.template.building.repository.FloorRepository;
import com.example.template.floorplan.dto.FloorPlanRequest;
import com.example.template.floorplan.dto.FloorPlanResponse;
import com.example.template.floorplan.model.FloorPlan;
import com.example.template.floorplan.repository.FloorPlanRepository;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.sql.SQLException;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Loads and stores the plan of a floor (E3.T5) and guards the shape-to-resource bindings in it
 * (E3.T4). Reads are open to every signed-in user; the write is guarded in the controller.
 */
@Service
public class FloorPlanService {

    static final int SCHEMA_VERSION = 1;

    /** Unique floor_id: two first saves of the same floor at once. */
    static final String ONE_PER_FLOOR_CONSTRAINT = "uq_floor_plans_floor";

    /** The floor was deleted between the existence check and the insert. */
    static final String FLOOR_FOREIGN_KEY = "fk_floor_plans_floor";

    private static final Logger log = LoggerFactory.getLogger(FloorPlanService.class);

    private final FloorPlanRepository floorPlanRepository;
    private final FloorRepository floorRepository;
    private final ResourceRepository resourceRepository;
    private final ObjectMapper objectMapper;

    public FloorPlanService(
            FloorPlanRepository floorPlanRepository,
            FloorRepository floorRepository,
            ResourceRepository resourceRepository,
            ObjectMapper objectMapper) {
        this.floorPlanRepository = floorPlanRepository;
        this.floorRepository = floorRepository;
        this.resourceRepository = resourceRepository;
        this.objectMapper = objectMapper;
    }

    /** The stored plan, or an empty one with version null when the floor has none yet. */
    @Transactional(readOnly = true)
    public FloorPlanResponse get(UUID floorId) {
        requireFloor(floorId);
        return floorPlanRepository
                .findByFloorId(floorId)
                .map(plan -> toResponse(plan, withoutStaleBindings(read(plan), resourceTypes(floorId))))
                .orElseGet(() -> new FloorPlanResponse(
                        floorId, null, SCHEMA_VERSION, objectMapper.createArrayNode(), null, null));
    }

    /**
     * Stores the plan if {@code request.version()} is still the current one, and answers it with
     * its new version.
     *
     * @throws ApiException 404 {@code FLOOR_NOT_FOUND}; 400 {@code FLOOR_PLAN_INVALID},
     *     {@code FLOOR_PLAN_RESOURCE_INVALID} or {@code FLOOR_PLAN_RESOURCE_ALREADY_PLACED};
     *     409 {@code FLOOR_PLAN_OUTDATED} when someone else saved in the meantime
     */
    @Transactional
    public FloorPlanResponse save(UUID floorId, FloorPlanRequest request, UUID savedBy) {
        requireFloor(floorId);
        FloorPlanContentValidator.validate(request.elements(), resourceTypes(floorId));

        var existing = floorPlanRepository.findByFloorId(floorId);
        if (!Objects.equals(existing.map(FloorPlan::getVersion).orElse(null), request.version())) {
            throw new ApiException(ErrorCode.FLOOR_PLAN_OUTDATED);
        }
        var plan = existing.orElseGet(() -> new FloorPlan(floorId));
        plan.setSchemaVersion(request.schemaVersion());
        String content = objectMapper.writeValueAsString(request.elements());
        FloorPlanContentValidator.validateSize(content);
        plan.setContent(content);
        plan.setUpdatedBy(savedBy);
        FloorPlan saved = store(plan);
        log.info(
                "Floor plan of floor {} saved at version {} ({} elements)",
                floorId,
                saved.getVersion(),
                request.elements().size());
        return toResponse(saved, request.elements());
    }

    /**
     * Writes the plan, turning the races the version check above cannot see into the right answer:
     * another save that slipped in between the read and this write (the {@code @Version} check) or
     * a parallel first save ({@value #ONE_PER_FLOOR_CONSTRAINT}) is {@code FLOOR_PLAN_OUTDATED}; a
     * floor deleted meanwhile ({@value #FLOOR_FOREIGN_KEY}) is {@code FLOOR_NOT_FOUND}. Any other
     * violation is a bug and stays a 500.
     */
    private FloorPlan store(FloorPlan plan) {
        try {
            return floorPlanRepository.saveAndFlush(plan);
        } catch (ObjectOptimisticLockingFailureException e) {
            throw new ApiException(ErrorCode.FLOOR_PLAN_OUTDATED);
        } catch (DataIntegrityViolationException e) {
            String constraint = violatedConstraint(e);
            if (constraint.contains(ONE_PER_FLOOR_CONSTRAINT)) {
                throw new ApiException(ErrorCode.FLOOR_PLAN_OUTDATED);
            }
            if (constraint.contains(FLOOR_FOREIGN_KEY)) {
                throw new ApiException(ErrorCode.FLOOR_NOT_FOUND);
            }
            throw e;
        }
    }

    private static String violatedConstraint(DataIntegrityViolationException e) {
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(e);
        return cause instanceof SQLException sql ? Objects.toString(sql.getMessage(), "") : "";
    }

    /** Only id and type are needed here; the plain query skips the equipment join of the filtered one. */
    private Map<UUID, ResourceType> resourceTypes(UUID floorId) {
        return resourceRepository.findByFloorIdOrderByNameAsc(floorId).stream()
                .collect(Collectors.toMap(Resource::requireId, Resource::getType));
    }

    private JsonNode read(FloorPlan plan) {
        return objectMapper.readTree(plan.getContent());
    }

    /**
     * Drops bindings to resources that were deleted (or changed type) after the plan was saved,
     * so the editor shows those shapes as unbound and the next save is accepted.
     */
    static JsonNode withoutStaleBindings(JsonNode elements, Map<UUID, ResourceType> floorResources) {
        if (!elements.isArray()) {
            return elements;
        }
        ArrayNode copy = (ArrayNode) elements.deepCopy();
        for (int i = 0; i < copy.size(); i++) {
            if (!(copy.get(i) instanceof ObjectNode element) || !element.has("resourceId")) {
                continue;
            }
            JsonNode raw = element.get("resourceId");
            UUID resourceId = null;
            if (raw != null && raw.isString()) {
                try {
                    resourceId = UUID.fromString(raw.asString());
                } catch (IllegalArgumentException ignored) {
                    // left null: removed below
                }
            }
            JsonNode type = element.get("type");
            ResourceType expected = type != null && type.isString()
                    ? FloorPlanContentValidator.BINDABLE.get(type.asString())
                    : null;
            if (resourceId == null || expected == null || floorResources.get(resourceId) != expected) {
                element.remove("resourceId");
            }
        }
        return copy;
    }

    private FloorPlanResponse toResponse(FloorPlan plan, JsonNode elements) {
        return new FloorPlanResponse(
                plan.getFloorId(),
                plan.getVersion(),
                plan.getSchemaVersion(),
                elements,
                plan.getUpdatedAt(),
                plan.getUpdatedBy());
    }

    private void requireFloor(UUID floorId) {
        if (!floorRepository.existsById(floorId)) {
            throw new ApiException(ErrorCode.FLOOR_NOT_FOUND);
        }
    }
}
