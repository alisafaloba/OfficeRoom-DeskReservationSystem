package com.example.template.building.service;

import com.example.template.building.dto.ResourceRequest;
import com.example.template.building.mapper.ResourceMapper;
import com.example.template.building.model.Equipment;
import com.example.template.building.model.Resource;
import com.example.template.building.repository.EquipmentRepository;
import com.example.template.building.repository.ResourceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service
public class ResourceService {

    private final ResourceRepository resourceRepository;
    private final EquipmentRepository equipmentRepository;
    private final ResourceMapper resourceMapper;

    public ResourceService(ResourceRepository resourceRepository,
                           EquipmentRepository equipmentRepository,
                           ResourceMapper resourceMapper) {
        this.resourceRepository = resourceRepository;
        this.equipmentRepository = equipmentRepository;
        this.resourceMapper = resourceMapper;
    }

    public List<Resource> getResourcesByFloor(UUID floorId, Resource.ResourceType type, UUID equipmentId) {
        /** Full filtering logic can be extended here*/
        return resourceRepository.findByFloorIdWithFilters(floorId, type, equipmentId);
    }

    @Transactional
    public Resource createResource(UUID floorId, ResourceRequest request) {
        validateCapacity(request);

        if (resourceRepository.existsByFloorIdAndLabel(floorId, request.label())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Label is not unique on this floor");
        }

        Resource resource = new Resource(floorId);
        mapRequestToEntity(request, resource);
        return resourceRepository.save(resource);
    }

    @Transactional
    public Resource updateResource(UUID floorId, UUID resourceId, ResourceRequest request) {
        validateCapacity(request);

        if (resourceRepository.existsByFloorIdAndLabelAndIdNot(floorId, request.label(), resourceId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Label is not unique on this floor");
        }

        Resource resource = resourceRepository.findById(resourceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resource not found"));

        mapRequestToEntity(request, resource);
        return resourceRepository.save(resource);
    }

    @Transactional
    public void deleteResource(UUID floorId, UUID resourceId) {
        // TODO: integrate with reservations when they are ready
        boolean hasFutureBookings = false;

        if (hasFutureBookings) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot delete resource with future bookings");
        }

        resourceRepository.deleteById(resourceId);
    }

    private void validateCapacity(ResourceRequest request) {
        if (request.type() == Resource.ResourceType.DESK) {
            if (request.capacity() == null || request.capacity() != 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A desk always has capacity 1");
            }
        } else if (request.type() == Resource.ResourceType.MEETING_ROOM) {
            if (request.capacity() == null || request.capacity() < 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A meeting room needs a capacity of at least 1");
            }
        }
    }

    private void mapRequestToEntity(ResourceRequest request, Resource resource) {
        resourceMapper.updateEntityFromRequest(request, resource);

        if (request.equipmentIds() != null && !request.equipmentIds().isEmpty()) {
            List<Equipment> equipmentList = equipmentRepository.findAllById(request.equipmentIds());
            resource.setEquipments(new HashSet<>(equipmentList));
        } else {
            resource.getEquipments().clear();
        }
    }
}