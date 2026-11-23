package com.example.template.building.service;

import com.example.template.building.dto.BuildingSchedule;
import com.example.template.building.mapper.BuildingMapper;
import com.example.template.building.repository.BuildingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Answers when the building around a floor is open, for the booking flows. */
@Service
public class BuildingScheduleService {

    private final FloorRepository floorRepository;
    private final BuildingRepository buildingRepository;
    private final BuildingMapper buildingMapper;

    public BuildingScheduleService(
            FloorRepository floorRepository, BuildingRepository buildingRepository, BuildingMapper buildingMapper) {
        this.floorRepository = floorRepository;
        this.buildingRepository = buildingRepository;
        this.buildingMapper = buildingMapper;
    }

    /**
     * The schedule of the building the floor belongs to.
     *
     * @throws ApiException FLOOR_NOT_FOUND; BUILDING_NOT_FOUND (cannot happen while the foreign key
     *     holds, kept so a broken row surfaces as 404 and not as 500)
     */
    @Transactional(readOnly = true)
    public BuildingSchedule forFloor(UUID floorId) {
        var floor = floorRepository
                .findById(floorId)
                .orElseThrow(() -> new ApiException(ErrorCode.FLOOR_NOT_FOUND));
        var building = buildingRepository
                .findById(floor.getBuildingId())
                .orElseThrow(() -> new ApiException(ErrorCode.BUILDING_NOT_FOUND));
        return new BuildingSchedule(
                building.requireId(), building.getTimeZone(), buildingMapper.weekOrder(building.getOpeningHours()));
    }
}
