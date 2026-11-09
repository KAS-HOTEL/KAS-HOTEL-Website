/**
 * The HTTP adapter: the global error contract, request correlation and the
 * health surface.
 *
 * <p>No domain module may depend on this one — asserted by
 * {@code LayeringRulesTest}. Business rules must be reachable without a servlet.
 *
 * <p>Doc 58 §1 defines five surfaces with separate route trees, separate
 * authorisation and <strong>separate response types</strong>. There is no shared
 * controller and no "include internal fields if admin" flag. Public response
 * types will live under {@code web.publicapi}, which the denylist test scans.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Web Adapter",
        allowedDependencies = {"shared"})
package com.kas.platform.web;
