/**
 * The security foundation: deny by default, permission-based authorisation and
 * the authenticated principal.
 *
 * <p>Depends on {@code identity} for the permission catalogue and scope
 * resolution, and on {@code web} for the error contract, so a filter-chain
 * refusal returns the same body shape as a controller failure. Nothing depends
 * on this module in return.
 *
 * <p>Phase 7.4 added authentication: login, refresh, logout and session
 * management (doc 58 §3.4, §4). No OAuth provider and no social login are
 * present — doc 51 C9 keeps social login as future scope.
 *
 * <p><strong>Why this module depends on {@code audit}.</strong>
 * {@link com.kas.platform.security.CustomerRegistrationService} records an
 * account being created. The alternative was to place that service in
 * {@code identity}, which is deliberately a leaf allowed only {@code shared} —
 * putting {@code audit} behind it would push that dependency onto every module
 * above it. {@code media} and {@code onboarding} declare {@code audit} the same
 * way, for the same reason.
 *
 * <p><strong>Why this module depends on {@code property}.</strong>
 * {@code security.api.AdminPropertyController} serves the two property reads
 * from doc 58 §8. They live here because they exist to demonstrate that PARTNER
 * scope and cross-partner 404 hold over HTTP — a claim about an endpoint, not
 * about a repository. Keeping them here also keeps {@code property} free of any
 * web or security dependency, which is what {@code LayeringRulesTest} enforces
 * for every domain module. When a property module gains its own API layer, they
 * should move to it.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Security",
        allowedDependencies = {"shared", "identity", "web", "property", "audit"})
package com.kas.platform.security;
