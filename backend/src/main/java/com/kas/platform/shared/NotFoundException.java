package com.kas.platform.shared;

/**
 * 404. Also the correct response when a caller is out of scope for a record.
 *
 * <p>Doc 85 §6.3: a cross-partner access attempt returns 404, not 403, so the
 * existence of another partner's records is never disclosed. Use
 * {@link #outOfScope(String)} at the point where a scoped lookup came back
 * empty, so the intent is legible at the call site.
 */
public class NotFoundException extends KasException {

    public NotFoundException(String message) {
        super(ApiErrorCode.NOT_FOUND, message);
    }

    /**
     * The record either does not exist, or exists outside the caller's scope.
     * Deliberately indistinguishable to the caller.
     */
    public static NotFoundException outOfScope(String resource) {
        return new NotFoundException(resource + " not found");
    }
}
