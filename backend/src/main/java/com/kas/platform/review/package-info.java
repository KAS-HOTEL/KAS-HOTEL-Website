/** First-party reviews tied to completed KAS stays. */
@org.springframework.modulith.ApplicationModule(
        displayName = "Review",
        allowedDependencies = {"shared", "security", "identity", "audit", "property"})
package com.kas.platform.review;
