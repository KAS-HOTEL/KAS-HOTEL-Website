package com.kas.platform.web;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** SEC-01: the client address a proxy reported is used; one the client typed in {@code Forwarded} is not. */
class ProxyAddressConfigTest {

    private static HttpServletRequest through(MockHttpServletRequest request) throws Exception {
        AtomicReference<HttpServletRequest> seen = new AtomicReference<>();
        new ProxyAddressConfig.XForwardedOnlyFilter().doFilter(request, new MockHttpServletResponse(),
                (req, res) -> seen.set((HttpServletRequest) req));
        return seen.get();
    }

    private static MockHttpServletRequest fromProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/public/auth/login");
        request.setRemoteAddr("172.18.0.5");
        return request;
    }

    @Test void forwardedHeaderDoesNotChangeTheClientAddress() throws Exception {
        MockHttpServletRequest request = fromProxy();
        request.addHeader("Forwarded", "for=203.0.113.9;proto=https;host=evil.example");

        HttpServletRequest seen = through(request);

        assertThat(seen.getRemoteAddr()).isEqualTo("172.18.0.5");
        assertThat(seen.getServerName()).isNotEqualTo("evil.example");
        assertThat(seen.getHeader("Forwarded")).isNull();
    }

    @Test void forwardedHeaderDoesNotOverrideTheProxyAddress() throws Exception {
        MockHttpServletRequest request = fromProxy();
        request.addHeader("Forwarded", "for=203.0.113.9");
        request.addHeader("X-Forwarded-For", "198.51.100.7");

        assertThat(through(request).getRemoteAddr()).isEqualTo("198.51.100.7");
    }

    @Test void xForwardedForFromTheProxyIsStillUsed() throws Exception {
        MockHttpServletRequest request = fromProxy();
        request.addHeader("X-Forwarded-For", "198.51.100.7");
        request.addHeader("X-Forwarded-Proto", "https");

        HttpServletRequest seen = through(request);

        assertThat(seen.getRemoteAddr()).isEqualTo("198.51.100.7");
        assertThat(seen.getScheme()).isEqualTo("https");
    }
}
