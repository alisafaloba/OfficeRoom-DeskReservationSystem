package com.example.template.shared.error;

import org.springframework.http.HttpStatus;

/**
 * The closed set of business errors. Clients and tests key on the stable code and status,
 * never on message text.
 */
public enum ErrorCode {
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Request validation failed"),
    UNSUPPORTED_API_VERSION(HttpStatus.BAD_REQUEST, "Unsupported or malformed API version"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "Authentication is required"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Invalid credentials"),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "Invalid or expired token"),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "Access denied"),
    ORIGIN_NOT_ALLOWED(HttpStatus.FORBIDDEN, "Request origin is not allowed"),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "User not found"),
    EMAIL_ALREADY_IN_USE(HttpStatus.CONFLICT, "Email is already in use"),
    CANNOT_MODIFY_OWN_ACCOUNT(HttpStatus.CONFLICT, "You cannot change your own role or delete your own account"),
    BUILDING_NOT_FOUND(HttpStatus.NOT_FOUND, "Building not found"),
    BUILDING_NAME_ALREADY_IN_USE(HttpStatus.CONFLICT, "A building with this name already exists"),
    FLOOR_NOT_FOUND(HttpStatus.NOT_FOUND, "Floor not found"),
    FLOOR_NUMBER_ALREADY_IN_USE(HttpStatus.CONFLICT, "This building already has a floor with this number"),
    FLOOR_ORDER_OUTDATED(
            HttpStatus.CONFLICT, "The floors of this building have changed — reload and try again"),
    FLOOR_BACKGROUND_NOT_FOUND(HttpStatus.NOT_FOUND, "This floor has no background image"),
    UNSUPPORTED_IMAGE_TYPE(HttpStatus.BAD_REQUEST, "Only PNG and JPEG images are accepted"),
    IMAGE_TOO_LARGE(HttpStatus.BAD_REQUEST, "The image must be at most 10 MB"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "Resource not found"),
    RESOURCE_NOT_BOOKABLE(HttpStatus.BAD_REQUEST, "This resource type cannot be booked"),
    RESOURCE_NAME_ALREADY_IN_USE(HttpStatus.CONFLICT, "This floor already has a resource with this name"),
    RESOURCE_HAS_FUTURE_BOOKINGS(HttpStatus.CONFLICT, "Cannot delete a resource with future bookings"),
    INVALID_RESOURCE_CAPACITY(HttpStatus.BAD_REQUEST, "Invalid capacity for this resource type"),
    EQUIPMENT_NOT_FOUND(HttpStatus.BAD_REQUEST, "One or more equipment items were not found"),
    FLOOR_PLAN_INVALID(HttpStatus.BAD_REQUEST, "The floor plan is not valid"),
    FLOOR_PLAN_RESOURCE_INVALID(
            HttpStatus.BAD_REQUEST, "The plan references a resource that is not on this floor or does not fit the shape"),
    FLOOR_PLAN_RESOURCE_ALREADY_PLACED(HttpStatus.BAD_REQUEST, "A resource can be placed on the plan only once"),
    FLOOR_PLAN_OUTDATED(HttpStatus.CONFLICT, "Someone else saved this plan in the meantime — reload and try again"),
    EQUIPMENT_NAME_ALREADY_IN_USE(HttpStatus.CONFLICT, "An equipment type with this name already exists"),
    INVALID_TIME_RANGE(
            HttpStatus.BAD_REQUEST, "The time range must start before it ends and span at most 31 days"),
    BOOKING_NOT_FOUND(HttpStatus.NOT_FOUND, "Booking not found"),
    INVALID_BOOKING_STATUS_TRANSITION(HttpStatus.CONFLICT, "The booking cannot change to this status"),
    BOOKING_CONFLICT(HttpStatus.CONFLICT, "The resource is already booked for this time"),
    OUTSIDE_OPENING_HOURS(HttpStatus.BAD_REQUEST, "The booking lies outside the building's opening hours"),
    BOOKING_IN_PAST(HttpStatus.BAD_REQUEST, "The booking lies in the past"),
    BOOKING_TOO_FAR_AHEAD(HttpStatus.BAD_REQUEST, "The booking lies too far in the future"),
    RESOURCE_UNAVAILABLE(HttpStatus.CONFLICT, "The resource is not available for this time"),
    USER_ALREADY_HAS_DESK(HttpStatus.CONFLICT, "You already have a desk booked for this time"),
    BOOKING_NOT_MOVABLE(HttpStatus.CONFLICT, "Only confirmed bookings can be moved"),
    ATTENDEE_NOT_FOUND(HttpStatus.BAD_REQUEST, "One or more attendees are not known users"),
    LAST_ADMIN_REQUIRED(HttpStatus.CONFLICT, "At least one active administrator must remain"),
    ACCOUNT_DEACTIVATED(HttpStatus.FORBIDDEN, "This account has been deactivated — contact an administrator"),
    CONCURRENT_MODIFICATION(HttpStatus.CONFLICT, "The resource was modified concurrently — reload and retry"),
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "Too many requests"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
