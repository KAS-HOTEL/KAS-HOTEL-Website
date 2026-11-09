package com.kas.platform.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;

import java.util.List;

/**
 * The error body frozen by doc 58 §2:
 * {@code { code, message, details[], correlationId }}.
 *
 * <p>There is no {@code stackTrace}, {@code exception}, {@code sql},
 * {@code path} or {@code cause} field, and no map to hold arbitrary extras.
 * Doc 58 §9 layer 2 is the reasoning: leaking is not a matter of forgetting to
 * filter when the field does not exist.
 *
 * @param details field-level detail; omitted from the JSON when empty
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(
        String code,
        String message,
        List<Detail> details,
        String correlationId) {

    public ApiError {
        details = details == null ? List.of() : List.copyOf(details);
    }

    public static ApiError of(ApiErrorCode code, String message, String correlationId) {
        return new ApiError(code.name(), message, List.of(), correlationId);
    }

    public static ApiError of(ApiErrorCode code, String message,
                              List<Detail> details, String correlationId) {
        return new ApiError(code.name(), message, details, correlationId);
    }

    /** One entry of {@code details[]}. */
    public record Detail(String field, String code, String message) {

        public static Detail from(KasException.ErrorDetail detail) {
            return new Detail(detail.field(), detail.code(), detail.message());
        }
    }
}
