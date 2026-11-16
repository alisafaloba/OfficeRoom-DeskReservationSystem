package com.example.template.resource.service;

import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceRequest;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.mapper.ResourceMapper;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resources on a floor (desks, phone booths, parking spots, break rooms). Every operation names
 * the floor first: a resource id that belongs to another floor is 404, never a silent hit.
 * Reads are open to every signed-in user; writes are guarded in the controller.
 */
@Service
public class ResourceService {

    private static final Logger log = LoggerFactory.getLogger(ResourceService.class);

    private final ResourceRepository resourceRepository;
    private final FloorRepository floorRepository;
    private final ResourceMapper resourceMapper;

    public ResourceService(
            ResourceRepository resourceRepository,
            FloorRepository floorRepository,
            ResourceMapper resourceMapper) {
        this.resourceRepository = resourceRepository;
        this.floorRepository = floorRepository;
        this.resourceMapper = resourceMapper;
    }

    /**
     * Lists all resources of a floor. Optionally filtered by type.
     * Always in alphabetical order by name.
     */
    @Transactional(readOnly = true)
    public List<ResourceResponse> list(UUID floorId, ResourceType type) {
        requireFloor(floorId);
        List<Resource> resources = type != null
                ? resourceRepository.findByFloorIdAndTypeOrderByNameAsc(floorId, type)
                : resourceRepository.findByFloorIdOrderByNameAsc(floorId);
        return resources.stream().map(resourceMapper::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ResourceResponse getById(UUID floorId, UUID resourceId) {
        return resourceMapper.toResponse(find(floorId, resourceId));
    }

    @Transactional
    public ResourceResponse create(UUID floorId, ResourceRequest request) {
        requireFloor(floorId);
        var resource = new Resource(floorId);
        apply(resource, request);
        var saved = resourceRepository.saveAndFlush(resource);
        log.info("Resource {} ({}) created on floor {}", saved.requireId(), saved.getType(), floorId);
        return resourceMapper.toResponse(saved);
    }

    @Transactional
    public ResourceResponse update(UUID floorId, UUID resourceId, ResourceRequest request) {
        var resource = find(floorId, resourceId);
        apply(resource, request);
        log.info("Resource {} updated", resourceId);
        return resourceMapper.toResponse(resourceRepository.saveAndFlush(resource));
    }

    /**
     * Deletes a resource.
     *
     * <p>TODO(E5): reject with 409 RESOURCE_HAS_FUTURE_BOOKINGS once bookings exist.
     */
    @Transactional
    public void delete(UUID floorId, UUID resourceId) {
        var resource = find(floorId, resourceId);
        resourceRepository.delete(resource);
        log.info("Resource {} deleted from floor {}", resourceId, floorId);
    }

    /**
     * Guards the booking flow: throws {@link ErrorCode#RESOURCE_NOT_BOOKABLE} (400) when the
     * resource type is non-bookable (e.g. BREAK_ROOM). Called by the booking service (E5.T3).
     */
    @Transactional(readOnly = true)
    public ResourceResponse requireBookable(UUID floorId, UUID resourceId) {
        var resource = find(floorId, resourceId);
        if (!resource.getType().isBookable()) {
            throw new ApiException(ErrorCode.RESOURCE_NOT_BOOKABLE);
        }
        return resourceMapper.toResponse(resource);
    }

    private void requireFloor(UUID floorId) {
        if (!floorRepository.existsById(floorId)) {
            throw new ApiException(ErrorCode.FLOOR_NOT_FOUND);
        }
    }

    private Resource find(UUID floorId, UUID resourceId) {
        requireFloor(floorId);
        return resourceRepository
                .findByIdAndFloorId(resourceId, floorId)
                .orElseThrow(() -> new ApiException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    private void apply(Resource resource, ResourceRequest request) {
        resource.setName(request.name().strip());
        resource.setType(request.type());
    }
}
