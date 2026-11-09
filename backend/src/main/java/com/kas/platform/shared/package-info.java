/**
 * Shared kernel: money, error vocabulary, correlation and authorisation scope.
 *
 * <p>Declared {@code OPEN} because every module legitimately depends on it.
 * Nothing with behaviour belonging to a single module may be placed here.
 */
@org.springframework.modulith.ApplicationModule(
        type = org.springframework.modulith.ApplicationModule.Type.OPEN,
        displayName = "Shared Kernel")
package com.kas.platform.shared;
