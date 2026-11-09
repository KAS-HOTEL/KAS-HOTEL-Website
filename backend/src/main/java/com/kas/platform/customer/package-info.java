/** Customer identity profiles, membership data, wallet expiry, and customer administration APIs. */
@org.springframework.modulith.ApplicationModule(
        displayName = "Customer",
        allowedDependencies = {"shared", "identity", "security", "audit"})
package com.kas.platform.customer;
