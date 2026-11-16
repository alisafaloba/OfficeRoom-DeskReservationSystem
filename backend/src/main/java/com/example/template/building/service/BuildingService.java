package com.example.template.building.service;

import com.example.template.building.dto.BuildingRequest;
import com.example.template.building.dto.BuildingResponse;
import com.example.template.building.mapper.BuildingMapper;
import com.example.template.building.model.Building;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads are open to every signed-in user (building selectors); writes are guarded in the controller. */
@Service
public class BuildingService {

    private static final Logger log = LoggerFactory.getLogger(BuildingService.class);

    private final BuildingRepository buildingRepository;
    private final FloorRepository floorRepository;
    private final BuildingMapper buildingMapper;

    public BuildingService(
            BuildingRepository buildingRepository, FloorRepository floorRepository, BuildingMapper buildingMapper) {
        this.buildingRepository = buildingRepository;
        this.floorRepository = floorRepository;
        this.buildingMapper = buildingMapper;
    }

    /** Unpaged on purpose: a company has a handful of buildings and the selectors need them all. */
    @Transactional(readOnly = true)
    public List<BuildingResponse> list() {
        var buildings = buildingRepository.findAll(Sort.by("name").ascending());
        if (buildings.isEmpty()) {
            return List.of();
        }
        // One count query for the whole list, not one per building.
        Map<UUID, Long> floorCounts =
                floorRepository.countByBuildingIds(buildings.stream().map(Building::requireId).toList()).stream()
                        .collect(Collectors.toMap(
                                FloorRepository.FloorCount::getBuildingId, FloorRepository.FloorCount::getFloorCount));
        return buildings.stream()
                .map(building -> buildingMapper.toResponse(
                        building, Math.toIntExact(floorCounts.getOrDefault(building.requireId(), 0L))))
                .toList();
    }

    @Transactional(readOnly = true)
    public BuildingResponse getById(UUID id) {
        return toResponse(find(id));
    }

    @Transactional
    public BuildingResponse create(BuildingRequest request) {
        if (buildingRepository.existsByNameIgnoreCase(request.name().strip())) {
            throw new ApiException(ErrorCode.BUILDING_NAME_ALREADY_IN_USE);
        }
        var building = new Building();
        apply(building, request);
        var saved = saveAndFlush(building);
        log.info("Building {} created", saved.requireId());
        return buildingMapper.toResponse(saved, 0);
    }

    @Transactional
    public BuildingResponse update(UUID id, BuildingRequest request) {
        var building = find(id);
        if (buildingRepository.existsByNameIgnoreCaseAndIdNot(request.name().strip(), id)) {
            throw new ApiException(ErrorCode.BUILDING_NAME_ALREADY_IN_USE);
        }
        apply(building, request);
        log.info("Building {} updated", id);
        return toResponse(saveAndFlush(building));
    }

    /**
     * Floors go with the building through an ON DELETE CASCADE foreign key, and their resources
     * and plans go with the floors the same way (added with each of those tables). Rejecting
     * deletion over future bookings joins here with E5.
     */
    @Transactional
    public void delete(UUID id) {
        buildingRepository.delete(find(id));
        log.info("Building {} deleted", id);
    }

    /**
     * Flushes so a concurrent insert of the same name trips the unique index here, not at commit
     * after the method has returned; that race is a 409, same as the exists check.
     */
    private Building saveAndFlush(Building building) {
        try {
            return buildingRepository.saveAndFlush(building);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(ErrorCode.BUILDING_NAME_ALREADY_IN_USE);
        }
    }

    private BuildingResponse toResponse(Building building) {
        long floorCount = floorRepository.countByBuildingId(building.requireId());
        return buildingMapper.toResponse(building, Math.toIntExact(floorCount));
    }

    private Building find(UUID id) {
        return buildingRepository.findById(id).orElseThrow(() -> new ApiException(ErrorCode.BUILDING_NOT_FOUND));
    }

    private void apply(Building building, BuildingRequest request) {
        building.setName(request.name().strip());
        building.setAddress(request.address().strip());
        building.setTimeZone(request.timeZone());
        building.getOpeningHours().clear();
        request.openingHours().forEach(day -> building.getOpeningHours().add(buildingMapper.toEntity(day)));
    }
}
