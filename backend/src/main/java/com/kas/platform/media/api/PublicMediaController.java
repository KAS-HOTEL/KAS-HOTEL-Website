package com.kas.platform.media.api;

import com.kas.platform.media.PublishedMediaRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Public galleries.
 *
 * <p>{@code GET /public/properties/{slug}/gallery} is <strong>doc 58 §3.1
 * verbatim</strong> — "Full gallery". The room-type media path is an addition:
 * doc 58 §3.1 defines {@code /room-types/{rtSlug}} as a detail endpoint that
 * would carry its images, but that endpoint does not exist yet, so the gallery is
 * exposed on its own for now. <strong>OQ-108</strong> records the doc 58
 * reconciliation.
 *
 * <p>No filtering happens here. Every publication rule lives in
 * {@link PublishedMediaRepository}'s SQL, so an unpublished image cannot be
 * returned by any handler that forgets to think about it.
 */
@RestController
@RequestMapping("/api/v1/public/properties/{slug}")
public class PublicMediaController {

    private static final String DEFAULT_LOCALE = "en";

    private final PublishedMediaRepository published;

    public PublicMediaController(PublishedMediaRepository published) {
        this.published = published;
    }

    /** Doc 58 §3.1 — the property gallery. Cover first. */
    @GetMapping("/gallery")
    @PublicEndpoint(reason = "Doc 58 §3.1 — the public property gallery is unauthenticated")
    public List<PublicMediaView> gallery(@PathVariable String slug,
                                         @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.forProperty(slug, locale);
    }

    /** Images of one published room type of one published property. */
    @GetMapping("/room-types/{roomTypeSlug}/gallery")
    @PublicEndpoint(reason = "Doc 58 §3.1 room-type detail carries its gallery; OQ-108")
    public List<PublicMediaView> roomGallery(
            @PathVariable String slug,
            @PathVariable String roomTypeSlug,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return published.forRoomType(slug, roomTypeSlug, locale);
    }
}
