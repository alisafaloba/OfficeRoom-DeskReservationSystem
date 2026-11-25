package com.example.template.resource.service;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Tells which resources are out of service until further notice (E2.T4): MAINTENANCE for
 * everyone, RESTRICTED for everyone but admins, who may still book it. Such a resource shows as
 * unavailable on the floor plan, whatever bookings it holds.
 *
 * <p>A seam so the availability view (E4.T1) does not depend on how E2.T4 stores the status.
 */
public interface ResourceStatusReader {

    /**
     * The subset of {@code resourceIds} that {@code viewerIsAdmin} cannot book because of its
     * status: MAINTENANCE always, RESTRICTED unless the viewer is an admin.
     */
    Set<UUID> unavailableAmong(Collection<UUID> resourceIds, boolean viewerIsAdmin);
}
