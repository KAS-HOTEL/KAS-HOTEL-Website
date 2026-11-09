package com.kas.platform.web;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.MissingConfigurationException;
import com.kas.platform.shared.NotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The global error contract from doc 58 §2, exercised end to end.
 *
 * <p>Standalone MockMvc, so this covers the handler and the response shape
 * without a Spring context or a database. The probe controller lives in this
 * test file and is never component-scanned.
 */
class GlobalExceptionHandlerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ErrorProbeController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("404 — not found, in the frozen body shape")
    void notFound() throws Exception {
        mockMvc.perform(get("/probe/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.correlationId").isNotEmpty());
    }

    @Test
    @DisplayName("422 CONFIG_MISSING names the setting, so the caller can act")
    void configMissingNamesTheSetting() throws Exception {
        mockMvc.perform(get("/probe/config-missing"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CONFIG_MISSING"))
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("DIRECT_ALTERNATIVE_HOLD_DURATION")));
    }

    @Test
    @DisplayName("409 ILLEGAL_TRANSITION names the lifecycle, never a generic status")
    void illegalTransition() throws Exception {
        mockMvc.perform(get("/probe/illegal-transition"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"))
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("stayStatus")));
    }

    @Test
    @DisplayName("422 NO_AVAILABILITY — a domain refusal, not a server error")
    void noAvailability() throws Exception {
        mockMvc.perform(get("/probe/no-availability"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));
    }

    @Test
    @DisplayName("400 VALIDATION_FAILED carries field-level detail")
    void bodyValidationProducesFieldDetails() throws Exception {
        mockMvc.perform(post("/probe/validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reference\":\"\",\"adults\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.length()").value(2))
                .andExpect(jsonPath("$.details[*].field",
                        org.hamcrest.Matchers.containsInAnyOrder("reference", "adults")));
    }

    @Test
    @DisplayName("a database failure never leaks SQL, table names or the driver message")
    void databaseFailureLeaksNothing() throws Exception {
        String body = mockMvc.perform(get("/probe/data-access"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain("SELECT")
                .doesNotContain("reservation")
                .doesNotContain("sales_status")
                .doesNotContain("BadSqlGrammar")
                .doesNotContain("SQLException");
    }

    @Test
    @DisplayName("an unexpected failure returns a constant message and no diagnostics")
    void unexpectedFailureLeaksNothing() throws Exception {
        String body = mockMvc.perform(get("/probe/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain("C:\\")
                .doesNotContain("com.kas.platform")
                .doesNotContain("java.lang")
                .doesNotContain("secret-internal-detail");
    }

    @Test
    @DisplayName("a controller's own status (404 no customer profile) keeps its status instead of 500")
    void responseStatusKeepsItsStatus() throws Exception {
        mockMvc.perform(get("/probe/status-not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Customer profile not found"));
        mockMvc.perform(get("/probe/status-teapot"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
    }

    @Test
    @DisplayName("every defined error code maps to its frozen HTTP status")
    void everyCodeCarriesItsFrozenStatus() {
        assertThat(ApiErrorCode.VALIDATION_FAILED.httpStatus()).isEqualTo(400);
        assertThat(ApiErrorCode.UNAUTHENTICATED.httpStatus()).isEqualTo(401);
        assertThat(ApiErrorCode.FORBIDDEN.httpStatus()).isEqualTo(403);
        assertThat(ApiErrorCode.NOT_FOUND.httpStatus()).isEqualTo(404);
        assertThat(ApiErrorCode.VERSION_CONFLICT.httpStatus()).isEqualTo(409);
        assertThat(ApiErrorCode.DUPLICATE_REFERENCE.httpStatus()).isEqualTo(409);
        assertThat(ApiErrorCode.ILLEGAL_TRANSITION.httpStatus()).isEqualTo(409);
        assertThat(ApiErrorCode.PROPERTY_CLOSED.httpStatus()).isEqualTo(410);
        assertThat(ApiErrorCode.NO_AVAILABILITY.httpStatus()).isEqualTo(422);
        assertThat(ApiErrorCode.OCCUPANCY_EXCEEDED.httpStatus()).isEqualTo(422);
        assertThat(ApiErrorCode.HORIZON_EXCEEDED.httpStatus()).isEqualTo(422);
        assertThat(ApiErrorCode.CONFIG_MISSING.httpStatus()).isEqualTo(422);
        assertThat(ApiErrorCode.RATE_LIMITED.httpStatus()).isEqualTo(429);
        assertThat(ApiErrorCode.AVAILABILITY_UNAVAILABLE.httpStatus()).isEqualTo(503);
    }

    /** Not a production endpoint. Never scanned; instantiated by hand above. */
    @RestController
    static class ErrorProbeController {

        @GetMapping("/probe/not-found")
        void notFound() {
            throw NotFoundException.outOfScope("Property");
        }

        @GetMapping("/probe/config-missing")
        void configMissing() {
            throw new MissingConfigurationException("DIRECT_ALTERNATIVE_HOLD_DURATION");
        }

        @GetMapping("/probe/illegal-transition")
        void illegalTransition() {
            throw ConflictException.illegalTransition("stayStatus", "CONFIRMED", "COMPLETED");
        }

        @GetMapping("/probe/no-availability")
        void noAvailability() {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "Those dates are not available for the rooms requested.");
        }

        @PostMapping("/probe/validate")
        void validate(@Valid @RequestBody ProbeRequest request) {
            // never reached in the failing case
        }

        @GetMapping("/probe/data-access")
        void dataAccess() {
            throw dataAccessFailure();
        }

        @GetMapping("/probe/status-not-found")
        void statusNotFound() {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "Customer profile not found");
        }

        @GetMapping("/probe/status-teapot")
        void statusTeapot() {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.I_AM_A_TEAPOT, "odd");
        }

        @GetMapping("/probe/boom")
        void boom() {
            throw new IllegalStateException("secret-internal-detail at C:\\Kas-Web\\backend");
        }

        private static DataAccessException dataAccessFailure() {
            return new BadSqlGrammarException("probe",
                    "SELECT sales_status FROM kas.reservation WHERE id = ?",
                    new SQLException("relation does not exist"));
        }
    }

    record ProbeRequest(@NotBlank String reference, @Min(1) int adults) {
    }
}
