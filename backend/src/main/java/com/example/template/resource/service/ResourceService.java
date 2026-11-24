package com.example.template.resource.service;

import com.example.template.booking.dto.BookingStatus;
import com.example.template.booking.repository.BookingRepository;
import com.example.template.building.repository.FloorRepository;
import com.example.template.resource.dto.ResourceRequest;
import com.example.template.resource.dto.ResourceResponse;
import com.example.template.resource.dto.ResourceStatus;
import com.example.template.resource.dto.ResourceStatusRequest;
import com.example.template.resource.dto.ResourceType;
import com.example.template.resource.mapper.ResourceMapper;
import com.example.template.resource.model.Equipment;
import com.example.template.resource.model.Resource;
import com.example.template.resource.repository.EquipmentRepository;
import com.example.template.resource.repository.ResourceRepository;
import com.example.template.shared.error.ApiException;
import com.example.template.shared.error.ErrorCode;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resources on a floor (desks, meeting rooms, phone booths, parking spots, break rooms). Every operation names
 * the floor first: a resource id that belongs to another floor is 404, never a silent hit.
 * Reads are open to every signed-in user; writes are guarded in the controller.
 */
@Service
public class ResourceService {

    private static final Logger log = LoggerFactory.getLogger(ResourceService.class);

    private final ResourceRepository resourceRepository;
    private final EquipmentRepository equipmentRepository;
    private final FloorRepository floorRepository;
    private final BookingRepository bookingRepository;
    private final ResourceMapper resourceMapper;

    public ResourceService(
            ResourceRepository resourceRepository,
            EquipmentRepository equipmentRepository,
            FloorRepository floorRepository,
            BookingRepository bookingRepository,
            ResourceMapper resourceMapper) {
        this.resourceRepository = resourceRepository;
        this.equipmentRepository = equipmentRepository;
        this.floorRepository = floorRepository;
        this.bookingRepository = bookingRepository;
        this.resourceMapper = resourceMapper;
    }

    /**
     * Lists all resources of a floor. Optionally filtered by type and/or equipment.
     * Always in alphabetical order by name.
     */
    @Transactional(readOnly = true)
    public List<ResourceResponse> list(UUID floorId, ResourceType type, UUID equipmentId) {
        requireFloor(floorId);
        return resourceRepository.findByFloorIdWithFilters(floorId, type, equipmentId).stream()
                .map(resourceMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ResourceResponse getById(UUID floorId, UUID resourceId) {
        return resourceMapper.toResponse(find(floorId, resourceId));
    }

    @Transactional
    public ResourceResponse create(UUID floorId, ResourceRequest request) {
        requireFloor(floorId);
        String cleanName = request.name().strip();
        validateCapacity(request);

        if (resourceRepository.existsByFloorIdAndNameIgnoreCase(floorId, cleanName)) {
            throw new ApiException(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE);
        }

        var resource = new Resource(floorId);
        apply(resource, request, cleanName);
        try {
            var saved = resourceRepository.saveAndFlush(resource);
            log.info("Resource {} ({}) created on floor {}", saved.requireId(), saved.getType(), floorId);
            return resourceMapper.toResponse(saved);
        } catch (DataIntegrityViolationException ex) {
            if (isNameUniqueConstraintViolation(ex)) {
                throw new ApiException(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE);
            }
            throw ex;
        }
    }

    @Transactional
    public ResourceResponse update(UUID floorId, UUID resourceId, ResourceRequest request) {
        var resource = find(floorId, resourceId);
        String cleanName = request.name().strip();
        validateCapacity(request);

        if (resourceRepository.existsByFloorIdAndNameIgnoreCaseAndIdNot(floorId, cleanName, resourceId)) {
            throw new ApiException(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE);
        }

        apply(resource, request, cleanName);
        try {
            var saved = resourceRepository.saveAndFlush(resource);
            log.info("Resource {} updated", resourceId);
            return resourceMapper.toResponse(saved);
        } catch (DataIntegrityViolationException ex) {
            if (isNameUniqueConstraintViolation(ex)) {
                throw new ApiException(ErrorCode.RESOURCE_NAME_ALREADY_IN_USE);
            }
            throw ex;
        }
    }

    private static boolean isNameUniqueConstraintViolation(DataIntegrityViolationException ex) {
        String msg = ex.getMessage();
        Throwable cause = ex.getMostSpecificCause();
        String rootMsg = cause.getMessage();
        return (msg != null && msg.contains("uq_resources_name_per_floor"))
                || (rootMsg != null && rootMsg.contains("uq_resources_name_per_floor"));
    }

    /**
     * Deletes a resource.
     *
     * @throws ApiException with {@link ErrorCode#RESOURCE_HAS_FUTURE_BOOKINGS} (409) if the
     *     resource has occupying bookings ending in the future.
     */
    @Transactional
    public void delete(UUID floorId, UUID resourceId) {
        var resource = find(floorId, resourceId);
        if (bookingRepository.existsByResourceIdAndStatusInAndEndsAtAfter(
                resourceId, BookingStatus.OCCUPYING, Instant.now())) {
            throw new ApiException(ErrorCode.RESOURCE_HAS_FUTURE_BOOKINGS);
        }
        resourceRepository.delete(resource);
        log.info("Resource {} deleted from floor {}", resourceId, floorId);
    }

    /**
     * Changes the operating status of a resource (AVAILABLE, MAINTENANCE, RESTRICTED).
     */
    @Transactional
    public ResourceResponse changeStatus(UUID floorId, UUID resourceId, ResourceStatusRequest request) {
        var resource = find(floorId, resourceId);
        resource.setStatus(request.status());
        resource.setStatusReason(request.status() == ResourceStatus.AVAILABLE ? null : (request.reason() != null ? request.reason().strip() : null));
        var saved = resourceRepository.saveAndFlush(resource);
        log.info("Resource {} status changed to {} on floor {}", resourceId, request.status(), floorId);
        return resourceMapper.toResponse(saved);
    }

    /**
     * Guards the booking flow: throws {@link ErrorCode#RESOURCE_NOT_BOOKABLE} (400) when the
     * resource type is non-bookable (e.g. BREAK_ROOM), and {@link ErrorCode#RESOURCE_UNAVAILABLE} (400)
     * when the resource is in MAINTENANCE, or in RESTRICTED when the user is not an admin.
     */
    @Transactional(readOnly = true)
    public ResourceResponse requireBookable(UUID floorId, UUID resourceId, boolean isAdmin) {
        var resource = find(floorId, resourceId);
        if (!resource.getType().isBookable()) {
            throw new ApiException(ErrorCode.RESOURCE_NOT_BOOKABLE);
        }
        if (resource.getStatus() == ResourceStatus.MAINTENANCE) {
            throw new ApiException(ErrorCode.RESOURCE_UNAVAILABLE);
        }
        if (resource.getStatus() == ResourceStatus.RESTRICTED && !isAdmin) {
            throw new ApiException(ErrorCode.RESOURCE_UNAVAILABLE);
        }
        return resourceMapper.toResponse(resource);
    }

    @Transactional(readOnly = true)
    public ResourceResponse requireBookable(UUID floorId, UUID resourceId) {
        return requireBookable(floorId, resourceId, false);
    }

    private void validateCapacity(ResourceRequest request) {
        if (request.type() == ResourceType.DESK) {
            if (request.capacity() != null && request.capacity() != 1) {
                throw new ApiException(ErrorCode.INVALID_RESOURCE_CAPACITY);
            }
        } else if (request.type() == ResourceType.MEETING_ROOM) {
            if (request.capacity() == null || request.capacity() < 1) {
                throw new ApiException(ErrorCode.INVALID_RESOURCE_CAPACITY);
            }
        } else if (request.capacity() != null && request.capacity() < 1) {
            throw new ApiException(ErrorCode.INVALID_RESOURCE_CAPACITY);
        }
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

    private void apply(Resource resource, ResourceRequest request, String cleanName) {
        resource.setName(cleanName);
        resource.setType(request.type());
        resource.setCapacity(request.capacity() != null ? request.capacity() : 1);
        resource.setNotes(request.notes());

        if (request.equipmentIds() != null && !request.equipmentIds().isEmpty()) {
            List<Equipment> equipmentList = equipmentRepository.findAllById(request.equipmentIds());
            if (equipmentList.size() != request.equipmentIds().size()) {
                throw new ApiException(ErrorCode.EQUIPMENT_NOT_FOUND);
            }
            resource.getEquipments().clear();
            resource.getEquipments().addAll(equipmentList);
        } else {
            resource.getEquipments().clear();
        }
    }
}