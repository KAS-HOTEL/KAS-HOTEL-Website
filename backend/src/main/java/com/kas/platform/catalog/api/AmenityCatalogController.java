package com.kas.platform.catalog.api;

import com.kas.platform.catalog.Amenity;
import com.kas.platform.catalog.AmenityRepository;
import com.kas.platform.identity.Permissions;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The amenity catalog — doc 58 §8, {@code /admin/amenities}, permission
 * {@code amenity.manage}.
 *
 * <h2>Why this exists now</h2>
 *
 * <p>A room-type form has to let a Partner pick amenities, and
 * {@code RoomTypeService} refuses any code that is not in the catalog. Without a
 * way to read the catalog, the only options were a hand-maintained list in the
 * frontend — which drifts the moment the owner adds an amenity — or asking a
 * Partner to type 56 codes from memory. The route was already frozen in doc 58
 * §8; only the handler was missing.
 *
 * <p><strong>Read-only.</strong> Doc 58 §8 pairs this path with
 * {@code amenity.manage}, and managing the catalog — creating, renaming,
 * archiving entries — is a platform-administration capability nothing has asked
 * for yet. Adding a write here would be inventing one.
 *
 * <h2>Not scoped, deliberately</h2>
 *
 * <p>The catalog is global reference data owned by no partner, which is also why
 * {@link AmenityRepository} takes no {@code AuthorizationScope}. Every
 * authenticated caller holding {@code amenity.manage} sees the same 56 rows;
 * there is nothing here that belongs to anyone.
 */
@RestController
@RequestMapping("/api/v1/admin/amenities")
public class AmenityCatalogController {

    private final AmenityRepository amenities;

    public AmenityCatalogController(AmenityRepository amenities) {
        this.amenities = amenities;
    }

    /** The selectable catalog, ordered by category then the catalog's own order. */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.AMENITY_MANAGE + "')")
    public List<AmenityView> list() {
        Map<UUID, Map<String, String>> names = amenities.findNames();
        return amenities.findAll().stream()
                .map(amenity -> AmenityView.of(amenity, names.getOrDefault(amenity.id(), Map.of())))
                .toList();
    }

    /**
     * One amenity as the room-type form needs it.
     *
     * <p>{@code code} is what the API accepts and what a room type stores.
     * {@code category} is one of the nine frozen doc 03 §6 values, and it is the
     * only grouping the catalog has — {@code PROPERTY_FACILITY} in particular is
     * the category {@code RoomTypeService} refuses on a room, so a client can
     * show why before the request is made rather than only after it is refused.
     *
     * <p>{@code names} is empty today: {@code amenity_translation} has no rows.
     * Returning the empty map rather than omitting the field says "no label has
     * been approved" instead of "this API does not do labels".
     *
     * <p>{@code id} and {@code icon} are absent — the API is addressed by code,
     * and no screen renders an icon reference that points at nothing.
     */
    public record AmenityView(
            String code,
            String category,
            Map<String, String> names,
            boolean isHighlight,
            int sortOrder) {

        static AmenityView of(Amenity amenity, Map<String, String> names) {
            return new AmenityView(amenity.code(), amenity.category(), Map.copyOf(names),
                    amenity.isHighlight(), amenity.sortOrder());
        }
    }
}
