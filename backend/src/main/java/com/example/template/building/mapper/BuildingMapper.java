package com.example.template.building.mapper;

import com.example.template.building.dto.BuildingResponse;
import com.example.template.building.dto.OpeningHoursDto;
import com.example.template.building.model.Building;
import com.example.template.building.model.OpeningHours;
import java.util.Comparator;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

@Mapper
public interface BuildingMapper {

    /** The floor count is counted by the service, in one query for a whole list. */
    @Mapping(target = "floorCount", source = "floorCount")
    @Mapping(target = "openingHours", source = "building.openingHours", qualifiedByName = "weekOrder")
    BuildingResponse toResponse(Building building, int floorCount);

    OpeningHoursDto toDto(OpeningHours openingHours);

    OpeningHours toEntity(OpeningHoursDto dto);

    /** The database stores the rows unordered; clients always get Monday through Sunday. */
    @Named("weekOrder")
    default List<OpeningHoursDto> weekOrder(List<OpeningHours> openingHours) {
        return openingHours.stream()
                .sorted(Comparator.comparing(OpeningHours::getDayOfWeek))
                .map(this::toDto)
                .toList();
    }
}
