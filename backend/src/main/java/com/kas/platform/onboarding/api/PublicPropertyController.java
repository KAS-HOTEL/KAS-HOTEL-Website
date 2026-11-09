package com.kas.platform.onboarding.api;

import com.kas.platform.property.PublishedProperty;
import com.kas.platform.property.PublishedPropertyContent;
import com.kas.platform.property.PublishedPropertyDetail;
import com.kas.platform.property.PublishedPropertyRepository;
import com.kas.platform.property.PublishedRoomType;
import com.kas.platform.security.PublicEndpoint;
import com.kas.platform.shared.NotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The public customer surface — doc 58 §3.1, paths exactly as the frozen
 * contract names them.
 *
 * <p><strong>Publication safety does not live here.</strong> Every method
 * delegates to {@link PublishedPropertyRepository}, whose SQL carries
 * {@code lifecycle_state IN ('OPEN','COMING_SOON','TEMPORARILY_CLOSED')}. A
 * property that has never been approved is {@code DRAFT} and cannot be returned
 * by any query on this controller, even if someone later adds a handler and
 * forgets to think about it — which is the point of putting the predicate in the
 * repository rather than in a controller condition.
 *
 * <p>The response types are {@link PublishedProperty} and
 * {@link PublishedRoomType}: separate types with no field able to carry
 * {@code partnerId}, a database id, inventory counts or a room number
 * (doc 58 §9 layer 2).
 */
@RestController
@RequestMapping("/api/v1/public/properties")
public class PublicPropertyController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedPropertyRepository published;

    public PublicPropertyController(PublishedPropertyRepository published) {
        this.published = published;
    }

    /**
     * Doc 58 §3.1 — the published properties. Excludes DRAFT and CLOSED.
     *
     * <p>{@code locale} defaults to {@code en} rather than reading
     * {@code DEFAULT_LOCALE} from settings: doc 51 A11 is still unresolved, and
     * a request parameter with an explicit fallback is honest about that, where
     * silently resolving a missing business setting would not be.
     *
     * <h2>Two of the four frozen filters</h2>
     *
     * <p>Doc 58 §3.1 names <em>district, character, amenity, collection</em>.
     * {@code district} and {@code amenity} are backed by data a Partner actually
     * authors and are implemented here.
     *
     * <p>{@code collection} and {@code character} are <strong>not</strong>.
     * V3 says of the collection column: <em>"OQ-009 unresolved; text until the
     * business decides. Not an invented enum"</em> — and nothing writes it, so
     * the filter could only ever match nothing. {@code character} has no column
     * at all; doc 18 §5 makes it the alternative that exists only <em>if</em>
     * OQ-009 rejects collections. Accepting either parameter would be promising
     * a narrowing this platform cannot perform.
     *
     * <p>A filter matching nothing returns {@code 200 []}. "No hotel in District
     * 7" is an answer, not a failure.
     */
    @GetMapping
    @PublicEndpoint(reason = "Doc 58 §3.1 — the public property list is unauthenticated")
    public List<PublishedProperty> list(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String amenity) {
        return published.findAll(locale, blankToNull(district), blankToNull(amenity));
    }

    /**
     * An empty parameter means "not filtering", not "match the empty string".
     *
     * <p>A form that submits every field sends {@code ?district=} for an
     * unselected dropdown, and treating that as a value would return nothing
     * from a page the guest had not filtered.
     */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /**
     * Doc 58 §3.1 — property detail by slug. 404 for anything not published.
     *
     * <p>Carries the hotel's <strong>amenities</strong>, which doc 58 §3.1 names
     * as part of the detail. They are this property's assignments, never the
     * shared catalogue, and both queries carry the same publication predicate —
     * so an unpublished hotel is a 404 here and its amenities are unreachable for
     * the same reason, not because of a second check that could be forgotten.
     *
     * <p>Also carries the hotel's <strong>signature experiences</strong> — doc 67
     * §1's section 5, added by Step 16A.47's owner decision. Doc 58 does not
     * mention experiences anywhere, so this placement is the owner's ruling
     * rather than an inference: they sit beside landmarks, on the surface that
     * already carries the detail's editorial content, and under the same
     * publication predicate as everything else here.
     */
    @GetMapping("/{slug}")
    @PublicEndpoint(reason = "Doc 58 §3.1 — public property detail")
    public PublishedPropertyDetail detail(
            @PathVariable String slug,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        // The content row, not the portfolio row: it carries the signature line
        // and short description doc 23 §3.2 places on guest surfaces, from the
        // same translation join and under the same publication rule.
        PublishedPropertyContent content = published.findContentBySlug(slug, locale)
                .orElseThrow(() -> new NotFoundException("Property not found"));

        return PublishedPropertyDetail.of(
                content,
                published.findAmenities(slug, locale),
                published.findLandmarks(slug, locale),
                published.findExperiences(slug, locale));
    }

    /**
     * The public website's hotel cards, in the operator's order. The website lists
     * exactly these, so a hotel hidden, closed or added in the console disappears from
     * or appears on the site without a code change. A literal path, so it is matched
     * before {@code /{slug}}.
     */
    @GetMapping("/catalogue")
    @PublicEndpoint(reason = "Public website hotel cards; same publication rule as the list")
    public List<com.kas.platform.property.PublishedPropertyCard> catalogue(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.findCards(locale);
    }

    /** Doc 58 §3.1 — published room types of a published property. */
    @GetMapping("/{slug}/room-types")
    @PublicEndpoint(reason = "Doc 58 §3.1 — public room type list")
    public List<PublishedRoomType> roomTypes(
            @PathVariable String slug,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        // A published property with no published rooms legitimately returns an
        // empty list; an unpublished one returns 404 from the detail endpoint.
        published.findBySlug(slug, locale)
                .orElseThrow(() -> new NotFoundException("Property not found"));
        return published.findRoomTypes(slug, locale);
    }
}
