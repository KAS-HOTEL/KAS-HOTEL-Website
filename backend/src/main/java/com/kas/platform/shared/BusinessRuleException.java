package com.kas.platform.shared;

import java.util.List;

/**
 * 422 — a domain rule refused the request, with actionable guidance.
 *
 * <p>Doc 58 §2.1 reserves 422 for domain errors. {@code CONFIG_MISSING} is
 * modelled separately by {@link MissingConfigurationException} because it is
 * not a domain refusal — it means KAS has not yet supplied a value.
 */
public class BusinessRuleException extends KasException {

    public BusinessRuleException(ApiErrorCode code, String message) {
        this(code, message, List.of());
    }

    public BusinessRuleException(ApiErrorCode code, String message, List<ErrorDetail> details) {
        super(requireDomainCode(code), message, details);
    }

    private static ApiErrorCode requireDomainCode(ApiErrorCode code) {
        if (code.httpStatus() != 422) {
            throw new IllegalArgumentException(
                    "BusinessRuleException carries 422 domain codes only, got " + code);
        }
        return code;
    }
}
