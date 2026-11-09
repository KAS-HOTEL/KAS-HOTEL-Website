package com.kas.platform.onboarding.api;

import com.kas.platform.property.PublicPolicyView;
import com.kas.platform.property.PublishedPolicyRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The policies a guest sees for a property.
 *
 * <p>Doc 58 §3.1 states that property detail "includes … policies". This exposes
 * them on their own path because the property detail response is a flat record
 * and splitting it is a bigger contract change than adding a sibling — the same
 * shape as the gallery in doc 95 §10. <strong>OQ-111</strong> covers the doc 58
 * reconciliation.
 *
 * <p>Doc 58 §3.1's {@code /public/policies/{type}} — the platform-level
 * {@code PRIVACY}, {@code TERMS} and {@code COOKIES} documents — is
 * <strong>not</strong> implemented here. Those are global policies with
 * {@code property_id IS NULL}, they are legal content KAS has not supplied
 * (doc 51 B13), and no Partner authors them. See doc 96 §5.
 *
 * <p>No filtering happens in this controller. Publication is enforced by
 * {@link PublishedPolicyRepository}'s SQL.
 */
@RestController
@RequestMapping("/api/v1/public/properties/{slug}")
public class PublicPolicyController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedPolicyRepository published;

    public PublicPolicyController(PublishedPolicyRepository published) {
        this.published = published;
    }

    /** The current version of each policy type, for a publicly visible property. */
    @GetMapping("/policies")
    @PublicEndpoint(reason = "Doc 58 §3.1 — property detail includes policies; OQ-111")
    public List<PublicPolicyView> policies(
            @PathVariable String slug,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.forProperty(slug, locale);
    }
}
