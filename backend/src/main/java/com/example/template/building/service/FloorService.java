package com.example.template.building.service;

import com.example.template.building.dto.FloorOrderRequest;
import com.example.template.building.dto.FloorRequest;
import com.example.template.building.dto.FloorResponse;
import com.example.template.building.mapper.FloorMapper;
import com.example.template.building.model.Floor;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Floors of one building. Every operation names the building first: a floor id that belongs to
 * another building is 404, never a silent hit. Reads are open to every signed-in user; writes
 * are guarded in the controller.
 */
@Service
public class FloorService {

    private static final Logger log = LoggerFactory.getLogger(FloorService.class);

    private final FloorRepository floorRepository;
    private final BuildingRepository buildingRepository;
    private final FloorMapper floorMapper;

    public FloorService(
            FloorRepository floorRepository, BuildingRepository buildingRepository, FloorMapper floorMapper) {
        this.floorRepository = floorRepository;
        this.buildingRepository = buildingRepository;
        this.floorMapper = floorMapper;
    }

    /** Always in display order. Unpaged: a building has a handful of floors. */
    @Transactional(readOnly = true)
    public List<FloorResponse> list(UUID buildingId) {
        requireBuilding(buildingId);
        return toResponses(floorsOf(buildingId));
    }

    @Transactional(readOnly = true)
    public FloorResponse getById(UUID buildingId, UUID floorId) {
        return floorMapper.toResponse(find(buildingId, floorId));
    }

    /** A new floor goes to the end of the display order. */
    @Transactional
    public FloorResponse create(UUID buildingId, FloorRequest request) {
        requireBuilding(buildingId);
        if (floorRepository.existsByBuildingIdAndNumber(buildingId, request.number())) {
            throw new ApiException(ErrorCode.FLOOR_NUMBER_ALREADY_IN_USE);
        }
        var floor = new Floor(buildingId);
        apply(floor, request);
        floor.setSortOrder(floorRepository.nextSortOrder(buildingId));
        var saved = saveAndFlush(floor);
        log.info("Floor {} created in building {}", saved.requireId(), buildingId);
        return floorMapper.toResponse(saved);
    }

    @Transactional
    public FloorResponse update(UUID buildingId, UUID floorId, FloorRequest request) {
        var floor = find(buildingId, floorId);
        if (floorRepository.existsByBuildingIdAndNumberAndIdNot(buildingId, request.number(), floorId)) {
            throw new ApiException(ErrorCode.FLOOR_NUMBER_ALREADY_IN_USE);
        }
        apply(floor, request);
        log.info("Floor {} updated", floorId);
        return floorMapper.toResponse(saveAndFlush(floor));
    }

    /**
     * The floor's resources (E2.T3) and plan (E3) go with it through ON DELETE CASCADE foreign
     * keys added with those tables. The other floors keep their positions: a gap in the order is
     * harmless and closes with the next reorder.
     */
    @Transactional
    public void delete(UUID buildingId, UUID floorId) {
        var floor = find(buildingId, floorId);
        // TODO(E5): reject with 409 FLOOR_HAS_FUTURE_BOOKINGS once bookings exist (card E2.T2).
        floorRepository.delete(floor);
        log.info("Floor {} deleted from building {}", floorId, buildingId);
    }

    /**
     * Applies the order the admin dragged into place: position {@code i} of the list becomes
     * display position {@code i}. The list must name every floor of the building exactly once;
     * a list built from an outdated page (a floor added or removed meanwhile) is a 409, so the
     * client reloads instead of silently losing a floor.
     */
    @Transactional
    public List<FloorResponse> reorder(UUID buildingId, FloorOrderRequest request) {
        requireBuilding(buildingId);
        var ids = request.floorIds();
        if (new HashSet<>(ids).size() != ids.size()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "Each floor may appear only once in the order");
        }
        var floors = floorsOf(buildingId);
        var byId = floors.stream().collect(Collectors.toMap(Floor::requireId, Function.identity()));
        if (ids.size() != floors.size() || !byId.keySet().containsAll(ids)) {
            throw new ApiException(ErrorCode.FLOOR_ORDER_OUTDATED);
        }
        for (int position = 0; position < ids.size(); position++) {
            byId.get(ids.get(position)).setSortOrder(position);
        }
        // Flush inside the method so an optimistic-lock clash surfaces as 409 here.
        floorRepository.flush();
        log.info("Floors of building {} reordered", buildingId);
        return toResponses(floorsOf(buildingId));
    }

    private List<Floor> floorsOf(UUID buildingId) {
        return floorRepository.findByBuildingIdOrderBySortOrderAscNumberAsc(buildingId);
    }

    private List<FloorResponse> toResponses(List<Floor> floors) {
        return floors.stream().map(floorMapper::toResponse).toList();
    }

    /**
     * Flushes so a concurrent insert of the same number trips the unique constraint here, not at
     * commit after the method has returned; that race is a 409, same as the exists check.
     */
    private Floor saveAndFlush(Floor floor) {
        try {
            return floorRepository.saveAndFlush(floor);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(ErrorCode.FLOOR_NUMBER_ALREADY_IN_USE);
        }
    }

    private void requireBuilding(UUID buildingId) {
        if (!buildingRepository.existsById(buildingId)) {
            throw new ApiException(ErrorCode.BUILDING_NOT_FOUND);
        }
    }

    /** An unknown building is reported as such, so the client can tell the two 404s apart. */
    private Floor find(UUID buildingId, UUID floorId) {
        requireBuilding(buildingId);
        return floorRepository
                .findByIdAndBuildingId(floorId, buildingId)
                .orElseThrow(() -> new ApiException(ErrorCode.FLOOR_NOT_FOUND));
    }

    private void apply(Floor floor, FloorRequest request) {
        floor.setName(request.name().strip());
        floor.setNumber(request.number());
    }
}
