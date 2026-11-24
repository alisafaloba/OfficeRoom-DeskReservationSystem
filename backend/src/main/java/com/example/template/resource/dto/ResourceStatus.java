package com.example.template.resource.dto;

/**
 * Operating status of a resource.
 *
 * <ul>
 *   <li>{@link #AVAILABLE} - Available to book according to normal booking rules.</li>
 *   <li>{@link #MAINTENANCE} - Unavailable to everyone (including admins).</li>
 *   <li>{@link #RESTRICTED} - Unavailable to regular users; only admins can book.</li>
 * </ul>
 */
public enum ResourceStatus {
    AVAILABLE,
    MAINTENANCE,
    RESTRICTED
}
