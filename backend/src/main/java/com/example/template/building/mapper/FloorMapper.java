package com.example.template.building.mapper;

import com.example.template.building.dto.FloorResponse;
import com.example.template.building.model.Floor;
import org.mapstruct.Mapper;

@Mapper
public interface FloorMapper {

    FloorResponse toResponse(Floor floor);
}
