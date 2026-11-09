package com.kas.platform.media.api;

import com.kas.platform.media.PublishedMediaRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Every published hotel's console images in one read, for the public website
 * ({@code js/catalog-sync.js}): one request instead of one per hotel and room type.
 * Same publication rules as {@code /properties/{slug}/gallery}.
 */
@RestController
@RequestMapping("/api/v1/public/properties/catalogue/media")
public class PublicCatalogueMediaController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedMediaRepository published;

    public PublicCatalogueMediaController(PublishedMediaRepository published) {
        this.published = published;
    }

    @GetMapping
    @PublicEndpoint(reason = "Public website images; same publication rule as the public galleries")
    public List<PublicCatalogueMediaView> media(@RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.forCatalogue(locale);
    }
}
