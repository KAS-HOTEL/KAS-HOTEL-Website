/**
 * Business configuration: the registry of values KAS must supply, and the
 * mechanism that refuses to invent them.
 *
 * <p>Doc 51 §6 states three rules, of which two are enforced here:
 * <ol>
 *   <li>No hard-coded business value in application code. Any value from doc 51
 *       appearing as a literal is a defect.</li>
 *   <li>A missing required setting fails loudly at the point of use, naming the
 *       setting — it never silently defaults.</li>
 * </ol>
 *
 * <p>All 18 registered keys currently hold {@code NULL} (doc 88 §11). Nothing in
 * this module can produce a value that KAS has not supplied.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Business Configuration",
        allowedDependencies = {"shared"})
package com.kas.platform.settings;
