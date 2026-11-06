package com.example.template.building.service;

import com.example.template.building.dto.BuildingRequest;
import com.example.template.building.dto.BuildingResponse;
import com.example.template.building.mapper.BuildingMapper;
import com.example.template.building.model.Building;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads are open to every signed-in user (building selectors); writes are guarded in the controller. */
@Service
public class BuildingService {

    private static final Logger log = LoggerFactory.getLogger(BuildingService.class);

    private final BuildingRepository buildingRepository;
    private final BuildingMapper buildingMapper;

    public BuildingService(BuildingRepository buildingRepository, BuildingMapper buildingMapper) {
        this.buildingRepository = buildingRepository;
        this.buildingMapper = buildingMapper;
    }

    /** Unpaged on purpose: a company has a handful of buildings and the selectors need them all. */
    @Transactional(readOnly = true)
    public List<BuildingResponse> list() {
        return buildingRepository.findAll(Sort.by("name").ascending()).stream()
                .map(buildingMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public BuildingResponse getById(UUID id) {
        return buildingMapper.toResponse(find(id));
    }

    @Transactional
    public BuildingResponse create(BuildingRequest request) {
        if (buildingRepository.existsByNameIgnoreCase(request.name().strip())) {
            throw new ApiException(ErrorCode.BUILDING_NAME_ALREADY_IN_USE);
        }
        var building = new Building();
        apply(building, request);
        var saved = buildingRepository.save(building);
        log.info("Building {} created", saved.requireId());
        return buildingMapper.toResponse(saved);
    }

    @Transactional
    public BuildingResponse update(UUID id, BuildingRequest request) {
        var building = find(id);
        if (buildingRepository.existsByNameIgnoreCaseAndIdNot(request.name().strip(), id)) {
            throw new ApiException(ErrorCode.BUILDING_NAME_ALREADY_IN_USE);
        }
        apply(building, request);
        log.info("Building {} updated", id);
        return buildingMapper.toResponse(buildingRepository.save(building));
    }

    /**
     * Floors, resources and plans go with the building through ON DELETE CASCADE foreign keys
     * (added with each of those tables). Rejecting deletion over future bookings joins here
     * with E5.
     */
    @Transactional
    public void delete(UUID id) {
        buildingRepository.delete(find(id));
        log.info("Building {} deleted", id);
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
