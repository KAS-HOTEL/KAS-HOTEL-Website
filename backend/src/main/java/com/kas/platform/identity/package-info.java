/**
 * Identity, roles, the permission catalogue and scope resolution.
 *
 * <p>Holds no HTTP concerns. Spring Security wiring lives in the {@code security}
 * module, which depends on this one — never the reverse.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Identity & RBAC",
        allowedDependencies = {"shared"})
package com.kas.platform.identity;
