package com.kas.platform.security;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Map;

/**
 * The security foundation.
 *
 * <p>The rule that shapes everything below is doc 59 §7.1 — <strong>deny by
 * default</strong>. The chain ends in {@code denyAll()}, not
 * {@code authenticated()}: a new route is unreachable until someone declares
 * how it may be reached, and adding a controller can never accidentally publish
 * it.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    /** The HTML pages opened from booking email links (KAS-017). */
    private static final org.springframework.security.web.util.matcher.RequestMatcher EMAIL_ACTION_PAGES =
            org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.withDefaults()
                    .matcher(com.kas.platform.shared.EmailActionPageStyle.PATH_PATTERN);

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            SecurityErrorResponses errors,
                                            AuthCookies cookies,
                                            AccessTokenService accessTokens,
                                            com.kas.platform.identity.UserSessionRepository sessions,
                                            com.kas.platform.identity.IdentityRepository identity,
                                            com.kas.platform.identity.ScopeResolver scopeResolver)
            throws Exception {

        // Constructed here rather than injected as a bean — see the class comment
        // on TokenAuthenticationFilter for why a Filter bean would be registered
        // twice and authenticate nobody.
        TokenAuthenticationFilter tokenAuthenticationFilter = new TokenAuthenticationFilter(
                cookies, accessTokens, sessions, identity, scopeResolver);

        http
                .cors(Customizer.withDefaults())
                // Doc 58 §10: anti-CSRF on state-changing requests. Double-submit
                // cookie, because the session is a cookie (doc 59 §8) and cookie
                // auth is what CSRF attacks.
                //
                // CsrfCookieFilter below makes the token available from any request.
                // The only exceptions are the explicitly listed one-time email actions,
                // whose 256-bit expiring tokens provide their own request authenticity.
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        // These POSTs use a 256-bit, expiring, single-use email token.
                        // All other public POSTs remain CSRF protected.
                        .ignoringRequestMatchers(
                                "/api/v1/public/reservation-actions/*/approve",
                                "/api/v1/public/reservation-actions/*/propose",
                                "/api/v1/public/reservation-actions/*/paid",
                                "/api/v1/public/reservation-actions/*/confirm-payment",
                                "/api/v1/public/reservation-actions/*/accept-alternative",
                                "/api/v1/public/reservation-actions/*/reject-alternative",
                                "/api/v1/public/reservation-actions/*/guest-cancel",
                                // V66: the guest's signed SePay form, checked then forwarded to SePay.
                                "/api/v1/public/reservation-actions/*/sepay",
                                // Disk image store upload (LocalMediaController; absent when R2 is
                                // configured). Its HMAC-signed URL is the authority, as an R2
                                // pre-signed URL is.
                                "/api/v1/public/local-media/upload",
                                // SePay's server-to-server IPN: no browser, no cookie; the
                                // order is read back from SePay before anything is confirmed.
                                "/api/v1/public/payments/sepay/ipn",
                                // Guest back from SePay: only makes KAS read SePay's own order
                                // record; changes nothing a forged request could choose.
                                "/api/v1/public/payments/sepay/return/*"))
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)

                // Establishes the identity. Never refuses — the rules below do that.
                .addFilterBefore(tokenAuthenticationFilter, AuthorizationFilter.class)

                // No server-side session. Doc 59 §8 specifies a short access token
                // with a rotating refresh, delivered as HttpOnly cookies — the
                // token issuer ships with the auth endpoints in a later phase.
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // The API returns JSON; the only browser documents are the email action
                // pages, whose policy additionally allows their one hashed stylesheet.
                .headers(headers -> headers
                        .contentTypeOptions(Customizer.withDefaults())
                        .frameOptions(frame -> frame.deny())
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(31_536_000L))
                        // no-referrer everywhere except the email action pages. Their buttons are
                        // plain form POSTs to this same host, and under no-referrer a browser sends
                        // such a POST with "Origin: null", which the CORS filter below refuses
                        // ("Invalid CORS request") — the guest could not reach SePay (2026-11-14).
                        // same-origin keeps the token in the URL from leaving this host (nothing is
                        // sent to SePay or any other site) while the form carries its real origin.
                        .addHeaderWriter(new org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter(
                                new org.springframework.security.web.util.matcher.NegatedRequestMatcher(EMAIL_ACTION_PAGES),
                                new ReferrerPolicyHeaderWriter(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                        .addHeaderWriter(new org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter(
                                EMAIL_ACTION_PAGES,
                                new ReferrerPolicyHeaderWriter(ReferrerPolicyHeaderWriter.ReferrerPolicy.SAME_ORIGIN)))
                        .addHeaderWriter(new org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter(
                                new org.springframework.security.web.util.matcher.NegatedRequestMatcher(EMAIL_ACTION_PAGES),
                                new org.springframework.security.web.header.writers.ContentSecurityPolicyHeaderWriter(
                                        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")))
                        .addHeaderWriter(new org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter(
                                EMAIL_ACTION_PAGES,
                                new org.springframework.security.web.header.writers.ContentSecurityPolicyHeaderWriter(
                                        com.kas.platform.shared.EmailActionPageStyle.CONTENT_SECURITY_POLICY))))

                // Both refusals use the doc 58 §2 error body.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(errors.entryPoint())
                        .accessDeniedHandler(errors.accessDeniedHandler()))

                .authorizeHttpRequests(auth -> auth
                        // Internal dispatches, not routes. Spring Boot filters the
                        // ERROR and ASYNC dispatcher types by default, so without
                        // this a genuine 500 is re-refused on its way out and the
                        // caller sees 403 instead of the real failure.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()

                        // Liveness and readiness must answer an orchestrator that
                        // holds no credentials. Details are withheld from anonymous
                        // callers by `management.endpoint.health.show-details`.
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()

                        // Doc 58 §1: the Public Customer surface is unauthenticated.
                        // Per-endpoint authorisation still applies inside it.
                        .requestMatchers("/api/v1/public/**").permitAll()

                        // Doc 58 §1: authenticated surfaces. `authenticated()` is the
                        // FIRST of three layers, not the only one:
                        //   1. here — you must be someone;
                        //   2. @PreAuthorize on the handler — you must hold the
                        //      permission from doc 59 §4;
                        //   3. AuthorizationScope at the repository — you must reach
                        //      the row.
                        // DenyByDefaultTest fails the build if a handler in these
                        // trees omits layer 2, so "authenticated" can never quietly
                        // become "authorised".
                        .requestMatchers("/api/v1/me/**").authenticated()
                        // QA-003: a signed-in customer used to reach request binding and see
                        // 400 VALIDATION_FAILED (parameter names) before the method's 403.
                        // The console surface now also requires at least one permission
                        // outside the customer bundle — still a permission check, not a role.
                        .requestMatchers("/api/v1/admin/**").access(ConsoleAccess.manager())

                        // Everything else — including every actuator endpoint other
                        // than health, and any route added later — is refused until
                        // it declares otherwise.
                        .anyRequest().denyAll());

        return http.build();
    }

    /**
     * Browser origins that may use the cookie-authenticated API cross-origin, from
     * {@code KAS_CORS_ALLOWED_ORIGINS} (see {@link CorsOrigins}). Nothing is hard-coded:
     * production lists its website and console hosts, the dev profile its local ports.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @org.springframework.beans.factory.annotation.Value("${kas.cors.allowed-origins:}") String allowedOrigins) {
        java.util.List<String> origins = CorsOrigins.parse(allowedOrigins);
        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class)
                .info("CORS allowed origins: {}", origins.isEmpty() ? "(none: same-origin only)" : origins);
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins);
        cors.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(java.util.List.of("Accept", "Content-Type", "X-XSRF-TOKEN", "Idempotency-Key"));
        cors.setAllowCredentials(true);
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/**", cors);
        source.registerCorsConfiguration("/actuator/health/**", cors);
        return source;
    }

    /**
     * Argon2id, as required by doc 59 §8.
     *
     * <p>Wrapped in a {@link DelegatingPasswordEncoder} so stored hashes carry an
     * {@code {argon2}} prefix and the algorithm can be migrated later without a
     * flag day. Verification still accepts the other prefixes Spring Security
     * knows, which matters only for a future import; new hashes are always
     * Argon2id.
     *
     * <p>Doc 59 §8 also requires breach-list checking at registration. That is a
     * property of the registration flow, which ships with the auth endpoints —
     * it is not a property of the encoder, and is recorded in doc 89 §7.4.
     */
    @Bean
    PasswordEncoder passwordEncoder() {
        Argon2PasswordEncoder argon2 = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
        // An unprefixed stored hash is rejected rather than guessed at: that is
        // DelegatingPasswordEncoder's default behaviour and it is left in place.
        return new DelegatingPasswordEncoder("argon2", Map.of("argon2", argon2));
    }
}
