package com.example.template.resource.mapper;

import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.model.Resource;
import org.springframework.stereotype.Component;

/** Converts {@link Resource} entities to API DTOs. */
@Component
public class ResourceMapper {

    public ResourceResponse toResponse(Resource resource) {
        return new ResourceResponse(
                resource.requireId(),
                resource.getFloorId(),
                resource.getName(),
                resource.getType(),
                resource.getType().isBookable(),
                resource.getCreatedAt());
    }
}
