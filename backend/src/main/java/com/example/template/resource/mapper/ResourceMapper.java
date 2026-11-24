package com.example.template.resource.mapper;

import com.example.template.resource.dto.EquipmentResponse;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.model.Resource;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

/** Maps the internal {@link Resource} entity to the public {@link ResourceResponse} DTO. */
@Component
public class ResourceMapper {

    public ResourceResponse toResponse(Resource resource) {
        List<EquipmentResponse> equipment = resource.getEquipments().stream()
                .map(eq -> new EquipmentResponse(eq.requireId(), eq.getName()))
                .sorted(Comparator.comparing(EquipmentResponse::name))
                .toList();

        return new ResourceResponse(
                resource.requireId(),
                resource.getFloorId(),
                resource.getName(),
                resource.getType(),
                resource.getCapacity(),
                resource.getNotes(),
                resource.getStatus(),
                resource.getStatusReason(),
                resource.getType().isBookable(),
                equipment,
                resource.getCreatedAt());
    }
}