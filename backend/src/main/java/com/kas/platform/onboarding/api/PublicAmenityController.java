package com.kas.platform.onboarding.api;

import com.kas.platform.catalog.PublicAmenity;
import com.kas.platform.catalog.PublishedAmenityRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The amenity vocabulary a guest can read — doc 58 §3.1's
 * {@code GET /public/amenities}, <em>"Amenity taxonomy"</em>.
 *
 * <h2>Why a guest needs it</h2>
 *
 * <p>Doc 58 §3.1 gives the portfolio an {@code amenity} filter, and that filter
 * takes a <strong>code</strong>. Without a public catalogue the only way to offer
 * the filter was a dropdown of raw codes — a database view, not a guest control.
 * This is the route that turns a code into a word.
 *
 * <h2>Why it lives in onboarding rather than catalog</h2>
 *
 * <p>{@code @PublicEndpoint} is in the {@code security} module, and Spring
 * Modulith allows {@code catalog} to reach only {@code shared}, {@code identity}
 * and {@code web}. Every other public read controller sits here for the same
 * reason — {@code PublicFacilityController} is here while its repository is in
 * {@code property} — so the boundary is respected rather than widened.
 *
 * <h2>What it does not carry</h2>
 *
 * <p>No {@code isHighlight}, no {@code sortOrder}, no {@code icon} and no
 * {@code id} — see {@link PublicAmenity}. No pagination, no search and no
 * category filter either: doc 58 gives the row no notes at all, and 56 codes is
 * not a page.
 *
 * <p><strong>This returns {@code 200 []} today</strong>, because the wording is
 * config A9 / OQ-031 and {@code amenity_translation} has no rows. An empty
 * taxonomy is a legitimate answer — the vocabulary exists, the approved words do
 * not — and the guest surface says nothing rather than showing a guest
 * {@code wifi-free}.
 */
@RestController
@RequestMapping("/api/v1/public/amenities")
public class PublicAmenityController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedAmenityRepository published;

    public PublicAmenityController(PublishedAmenityRepository published) {
        this.published = published;
    }

    /**
     * The vocabulary in the reader's locale.
     *
     * <p>{@code locale} defaults to {@code en} rather than reading
     * {@code DEFAULT_LOCALE} from settings, matching every sibling public route:
     * doc 51 A11 is unresolved, and an explicit fallback is honest about that
     * where silently resolving a missing business setting would not be.
     */
    @GetMapping
    @PublicEndpoint(reason = "Doc 58 §3.1 — the amenity taxonomy is unauthenticated")
    public List<PublicAmenity> list(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.findAll(locale);
    }
}
