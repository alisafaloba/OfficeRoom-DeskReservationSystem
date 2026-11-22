package com.example.template.resource.mapper;

import com.example.template.resource.dto.EquipmentResponse;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.model.Resource;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class ResourceMapper {

    public ResourceResponse toResponse(Resource resource) {
        Set<EquipmentResponse> equipment = resource.getEquipments().stream()
                .map(eq -> new EquipmentResponse(eq.requireId(), eq.getName()))
                .collect(Collectors.toSet());

        return new ResourceResponse(
                resource.requireId(),
                resource.getFloorId(),
                resource.getName(),
                resource.getType(),
                resource.getCapacity(),
                resource.getNotes(),
                resource.getStatus(),
                resource.getType().isBookable(),
                equipment,
                resource.getCreatedAt());
    }
}