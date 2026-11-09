package com.kas.platform.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers {@link UndeclaredEndpointGuard} across the whole API.
 *
 * <p>Registered for {@code /**} rather than a list of prefixes on purpose: a
 * guard that had to be told about each new route tree would fail exactly when a
 * route tree was added without anyone thinking about authorisation, which is the
 * case it exists to catch.
 */
@Configuration
class SecurityWebMvcConfiguration implements WebMvcConfigurer {

    private final UndeclaredEndpointGuard guard;

    SecurityWebMvcConfiguration(UndeclaredEndpointGuard guard) {
        this.guard = guard;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(guard).addPathPatterns("/**");
    }
}
