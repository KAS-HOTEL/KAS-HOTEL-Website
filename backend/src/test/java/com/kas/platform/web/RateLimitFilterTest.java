package com.kas.platform.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitFilterTest {

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-05T08:00:00Z"));
    private final Clock clock = new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    };

    private RateLimitFilter filter(MockEnvironment env) {
        return new RateLimitFilter(RateLimitFilter.rules(env), Duration.ofMinutes(1), clock, new ObjectMapper());
    }

    private MockHttpServletResponse call(RateLimitFilter filter, String method, String path, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test void refusesTheRequestAfterTheLimitWithRateLimitedAndRetryAfter() throws Exception {
        RateLimitFilter filter = filter(new MockEnvironment().withProperty("kas.rate-limit.register", "2"));
        assertThat(call(filter, "POST", "/api/v1/public/auth/customer-register", "203.0.113.7").getStatus()).isEqualTo(200);
        assertThat(call(filter, "POST", "/api/v1/public/auth/customer-register", "203.0.113.7").getStatus()).isEqualTo(200);
        MockHttpServletResponse refused = call(filter, "POST", "/api/v1/public/auth/customer-register", "203.0.113.7");
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getHeader("Retry-After")).isEqualTo("60");
        assertThat(refused.getContentAsString()).contains("\"code\":\"RATE_LIMITED\"");
    }

    @Test void countsEachAddressAndEachRuleSeparately() throws Exception {
        RateLimitFilter filter = filter(new MockEnvironment().withProperty("kas.rate-limit.register", "1")
                .withProperty("kas.rate-limit.login", "1"));
        assertThat(call(filter, "POST", "/api/v1/public/auth/customer-register", "203.0.113.7").getStatus()).isEqualTo(200);
        assertThat(call(filter, "POST", "/api/v1/public/auth/customer-register", "203.0.113.8").getStatus()).isEqualTo(200);
        assertThat(call(filter, "POST", "/api/v1/public/auth/login", "203.0.113.7").getStatus()).isEqualTo(200);
        assertThat(call(filter, "POST", "/api/v1/public/auth/customer-register", "203.0.113.7").getStatus()).isEqualTo(429);
    }

    @Test void reopensWhenTheWindowHasPassed() throws Exception {
        RateLimitFilter filter = filter(new MockEnvironment().withProperty("kas.rate-limit.account-email", "1"));
        assertThat(call(filter, "POST", "/api/v1/public/auth/forgot-password", "203.0.113.7").getStatus()).isEqualTo(200);
        assertThat(call(filter, "POST", "/api/v1/public/auth/verify-email", "203.0.113.7").getStatus()).isEqualTo(429);
        now.set(now.get().plusSeconds(61));
        assertThat(call(filter, "POST", "/api/v1/public/auth/verify-email", "203.0.113.7").getStatus()).isEqualTo(200);
    }

    @Test void leavesOtherEndpointsAndMethodsAlone() throws Exception {
        RateLimitFilter filter = filter(new MockEnvironment().withProperty("kas.rate-limit.receipt", "1"));
        for (int i = 0; i < 5; i++) {
            assertThat(call(filter, "GET", "/api/v1/public/properties", "203.0.113.7").getStatus()).isEqualTo(200);
            assertThat(call(filter, "GET", "/api/v1/public/auth/login", "203.0.113.7").getStatus()).isEqualTo(200);
        }
        assertThat(call(filter, "GET", "/api/v1/public/reservations/requests/KAS0000001/sent", "203.0.113.7").getStatus()).isEqualTo(200);
        assertThat(call(filter, "GET", "/api/v1/public/reservations/requests/KAS0000002/sent", "203.0.113.7").getStatus()).isEqualTo(429);
    }
}
