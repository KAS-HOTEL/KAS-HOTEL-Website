package com.kas.platform.web;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.ForwardedHeaderFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

/**
 * The client address comes from {@code X-Forwarded-*} only, never from the RFC 7239
 * {@code Forwarded} header.
 *
 * <p>Our proxies (Caddy, the website's {@code server.js}) write {@code X-Forwarded-For}
 * themselves and overwrite whatever the browser sent. None of them writes or removes
 * {@code Forwarded}, and Spring's {@link ForwardedHeaderFilter} prefers it, so a client
 * that typed {@code Forwarded: for=...} chose its own address: a new one per request got
 * past {@link RateLimitFilter} and into the sign-in audit (SEC-01, audit 2026-11-12).
 *
 * <p>This replaces Spring Boot's own registration ({@code forward-headers-strategy:
 * framework}) with the same filter behind a request that has no {@code Forwarded} header.
 */
@Configuration
class ProxyAddressConfig {

    private static final String FORWARDED = "Forwarded";

    @Bean
    FilterRegistrationBean<ForwardedHeaderFilter> forwardedHeaderFilter() {
        FilterRegistrationBean<ForwardedHeaderFilter> registration =
                new FilterRegistrationBean<>(new XForwardedOnlyFilter());
        registration.setDispatcherTypes(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR);
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    static final class XForwardedOnlyFilter extends ForwardedHeaderFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                        FilterChain chain) throws ServletException, IOException {
            super.doFilterInternal(new WithoutForwarded(request), response, chain);
        }
    }

    private static final class WithoutForwarded extends HttpServletRequestWrapper {
        WithoutForwarded(HttpServletRequest request) {
            super(request);
        }

        @Override
        public String getHeader(String name) {
            return FORWARDED.equalsIgnoreCase(name) ? null : super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            return FORWARDED.equalsIgnoreCase(name) ? Collections.emptyEnumeration() : super.getHeaders(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            List<String> names = Collections.list(super.getHeaderNames());
            names.removeIf(FORWARDED::equalsIgnoreCase);
            return Collections.enumeration(names);
        }
    }
}
