package com.example.template.building.mapper;

import com.example.template.building.dto.EquipmentResponse;
import com.example.template.building.dto.ResourceRequest;
import com.example.template.building.dto.ResourceResponse;
import com.example.template.building.model.Equipment;
import com.example.template.building.model.Resource;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

@Mapper(componentModel = "spring")
public interface ResourceMapper {

    ResourceResponse toResponse(Resource resource);

    EquipmentResponse toDto(Equipment equipment);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "floorId", ignore = true)
    @Mapping(target = "equipments", ignore = true)
    void updateEntityFromRequest(ResourceRequest request, @MappingTarget Resource resource);
}