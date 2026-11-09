/**
 * Property onboarding: the Partner submits, an Admin reviews, and approval
 * publishes.
 *
 * <p>This module owns the <em>editorial workflow</em> only. The property's
 * operating lifecycle stays in {@code property}, because doc 92 §3.2 kept them
 * apart deliberately: {@code lifecycle_state} answers "is this hotel open and
 * visible to guests", {@code property_submission.status} answers "has this change
 * been reviewed". Approval is where one drives the other, and that happens here.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Property Onboarding",
        allowedDependencies = {"shared", "property", "catalog", "identity", "audit", "security", "web"})
package com.kas.platform.onboarding;
