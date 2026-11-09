package com.kas.platform.web;

import com.kas.platform.shared.CorrelationId;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class CorrelationIdFilterTest {

    private final CorrelationIdFilter filter = new CorrelationIdFilter();

    @Test
    @DisplayName("a correlation id is generated and returned on every response")
    void generatesAndReturnsCorrelationId() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest(), response, noOpChain());

        assertThat(response.getHeader(CorrelationId.HEADER)).isNotBlank();
    }

    @Test
    @DisplayName("a well-formed inbound id is preserved, so a caller can trace across services")
    void preservesWellFormedInboundId() throws Exception {
        String inbound = UUID.randomUUID().toString();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(CorrelationId.HEADER, inbound);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, noOpChain());

        assertThat(response.getHeader(CorrelationId.HEADER)).isEqualTo(inbound);
    }

    @Test
    @DisplayName("a malformed inbound id is replaced — no log injection through the header")
    void replacesMalformedInboundId() throws Exception {
        String hostile = "abc\r\nWARN  forged log line: user promoted to SUPER_ADMIN";
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(CorrelationId.HEADER, hostile);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, noOpChain());

        String issued = response.getHeader(CorrelationId.HEADER);
        assertThat(issued).isNotEqualTo(hostile);
        assertThat(issued).doesNotContain("\n").doesNotContain("\r").doesNotContain("forged");
    }

    @Test
    @DisplayName("the id is visible to logging during the request, and cleared afterwards")
    void mdcIsSetDuringAndClearedAfter() throws Exception {
        AtomicReference<String> duringRequest = new AtomicReference<>();
        FilterChain capturing = (req, res) -> duringRequest.set(MDC.get(CorrelationId.MDC_KEY));

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturing);

        assertThat(duringRequest.get()).isNotBlank();
        // Threads are pooled: a leaked MDC entry would misattribute the next request.
        assertThat(MDC.get(CorrelationId.MDC_KEY)).isNull();
    }

    @Test
    @DisplayName("the MDC is cleared even when the request fails")
    void mdcIsClearedOnFailure() {
        FilterChain failing = (req, res) -> {
            throw new IllegalStateException("downstream failure");
        };

        try {
            filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), failing);
        } catch (Exception expected) {
            // the filter must still have cleaned up
        }

        assertThat(MDC.get(CorrelationId.MDC_KEY)).isNull();
    }

    private static FilterChain noOpChain() {
        return (request, response) -> {
        };
    }
}
