package com.example.template.resource.service;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Tells which resources are out of service until further notice: status MAINTENANCE or
 * RESTRICTED (E2.T4). Such a resource shows as unavailable on the floor plan for everyone,
 * whatever bookings it holds.
 *
 * <p>A seam so the availability view (E4.T1) does not depend on how E2.T4 stores the status.
 */
public interface ResourceStatusReader {

    /** The subset of {@code resourceIds} whose status is not AVAILABLE. */
    Set<UUID> unavailableAmong(Collection<UUID> resourceIds);
}
