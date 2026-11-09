package com.kas.platform.onboarding.api;

import com.kas.platform.property.PublicLocation;
import com.kas.platform.property.PublishedPropertyRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Map data for the portfolio — doc 58 §3.1's {@code GET /public/locations},
 * <em>"Map data — all properties"</em>, which doc 19 §2 renders as
 * {@code /locations}, <em>"Map-led discovery, all properties"</em>.
 *
 * <h2>Data, not a map</h2>
 *
 * <p>This serves the records. It integrates no map provider, draws no tiles and
 * clusters nothing: doc 58 names a route and a purpose and specifies no
 * behaviour, so anything beyond the records would be invented here. There is no
 * {@code /locations} page in the app today either, and building one for an
 * endpoint nobody consumes would be the same invention in a different file.
 *
 * <h2>Locale, because a marker needs a label</h2>
 *
 * <p>{@code locale} defaults to {@code en} like every sibling public route — doc
 * 51 A11 is unresolved and an explicit fallback is honest about that. The name
 * comes from the same inner join the portfolio list uses, so a property with no
 * name in the reader's locale is absent rather than labelled with its slug.
 *
 * <h2>No parameters beyond that</h2>
 *
 * <p>No bounding box, no radius, no zoom, no clustering and no pagination. Doc 58
 * gives the row no notes, and eight properties is not a page.
 *
 * <p><strong>This returns {@code 200 []} today</strong>, and would carry
 * {@code null} coordinates even if it did not: every seed property is
 * {@code DRAFT}, and V23 leaves coordinates <em>deliberately unseeded</em> as part
 * of content gap OQ-030 / doc 51 A1–A2. Nothing substitutes a city centre for a
 * missing pin.
 */
@RestController
@RequestMapping("/api/v1/public/locations")
public class PublicLocationController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedPropertyRepository published;

    public PublicLocationController(PublishedPropertyRepository published) {
        this.published = published;
    }

    /** Every publicly visible property, with whatever coordinates it has. */
    @GetMapping
    @PublicEndpoint(reason = "Doc 58 §3.1 — portfolio map data is unauthenticated")
    public List<PublicLocation> list(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.findLocations(locale);
    }
}
