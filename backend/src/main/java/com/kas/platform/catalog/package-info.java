/**
 * Controlled vocabularies a Partner selects from — currently the amenity
 * catalog.
 *
 * <p>Doc 03 §6: amenities are "a shared, controlled vocabulary across all
 * properties, not free text per hotel". That is what makes filtering,
 * comparison and consistent iconography possible, and it is why a Partner
 * chooses from this catalog rather than typing.
 *
 * <p>{@code identity} is an allowed dependency only so the read endpoint can name
 * its permission constant ({@code amenity.manage}, doc 58 §8); {@code web} for the
 * shared error contract. Neither is used by the repository, which stays pure.
 *
 * <p>A separate module rather than part of {@code property} for two reasons: the
 * catalog is global, so it is the one repository here that legitimately takes no
 * {@code AuthorizationScope}, and it is shared by both property-level and
 * room-type-level assignment.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Catalog",
        allowedDependencies = {"shared", "identity", "web"})
package com.kas.platform.catalog;
