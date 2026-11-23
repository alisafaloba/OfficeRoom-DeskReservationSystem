package com.example.template.shared.error;

import java.util.Map;

/**
 * The only exception services throw for business failures. Never {@code ResponseStatusException}
 * or raw {@code RuntimeException} — {@link GlobalExceptionHandler} translates this into an
 * RFC 9457 {@code ProblemDetail}.
 */
public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;
    private final Map<String, String> fieldErrors;

    public ApiException(ErrorCode errorCode) {
        super(errorCode.defaultMessage());
        this.errorCode = errorCode;
        this.fieldErrors = Map.of();
    }

    /**
     * A failure the client can show next to specific fields, keyed by the request path of the
     * field (e.g. {@code preferences.favoriteDeskId}). Shaped like Bean Validation's
     * {@code errors} so the client handles both the same way.
     */
    public ApiException(ErrorCode errorCode, Map<String, String> fieldErrors) {
        super(errorCode.defaultMessage());
        this.errorCode = errorCode;
        this.fieldErrors = Map.copyOf(fieldErrors);
    }

    public ApiException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.fieldErrors = Map.of();
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    public Map<String, String> fieldErrors() {
        return fieldErrors;
    }
}
