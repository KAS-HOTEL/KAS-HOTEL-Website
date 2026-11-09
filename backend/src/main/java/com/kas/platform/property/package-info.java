/**
 * Property — one of the eight KAS hotels (doc 52 §3.1).
 *
 * <p>The eight properties remain fully independent (doc 85 §1); they are not
 * merged into one hotel. Each carries its own identity, rooms, inventory, rates,
 * reservations, media and reviews.
 *
 * <p>This module is where partner isolation becomes concrete: every read is
 * filtered by {@code AuthorizationScope} at the repository boundary, so a
 * forgotten controller check cannot expose another partner's property.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Property",
        allowedDependencies = {"shared", "partner"})
package com.kas.platform.property;
