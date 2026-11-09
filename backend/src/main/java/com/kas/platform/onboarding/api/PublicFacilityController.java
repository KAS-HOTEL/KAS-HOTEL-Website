package com.kas.platform.onboarding.api;

import com.kas.platform.property.PublicFacilityView;
import com.kas.platform.property.PublishedFacilityRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * A property's facilities for a guest — doc 58 §3.1's
 * {@code GET /public/properties/{slug}/facilities}.
 *
 * <p>Doc 58 titles the route <em>"Facilities with galleries"</em> and the gallery
 * half is not served: {@code MediaOwnerType} records that <em>"FACILITY has no
 * API yet"</em>, so no image can be attached to a facility, and there are no
 * image bytes to attach in any case (OQ-106). Returning an empty
 * {@code images: []} on every facility would be a field that means "the contract
 * has one" rather than "this facility has none", so the view omits it until
 * facility media exists.
 *
 * <p>No filtering happens in this controller. Visibility and archiving are both
 * enforced by {@link PublishedFacilityRepository}'s SQL, so a controller change
 * cannot accidentally expose an unpublished hotel's blocks.
 */
@RestController
@RequestMapping("/api/v1/public/properties/{slug}")
public class PublicFacilityController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedFacilityRepository published;

    public PublicFacilityController(PublishedFacilityRepository published) {
        this.published = published;
    }

    /** The facilities of a publicly visible property, in the operator's order. */
    @GetMapping("/facilities")
    @PublicEndpoint(reason = "Doc 58 §3.1 — property detail includes facilities")
    public List<PublicFacilityView> facilities(
            @PathVariable String slug,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.forProperty(slug, locale);
    }
}
