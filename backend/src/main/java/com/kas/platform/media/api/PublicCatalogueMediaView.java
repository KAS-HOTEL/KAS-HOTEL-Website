package com.kas.platform.media.api;

import java.util.List;
import java.util.Map;

/**
 * The console-managed images of one published hotel, for the public website: its gallery
 * (cover first) and each published room type's gallery, keyed by room type slug.
 * Hotels and room types with no published image are simply absent or empty, and the
 * website then keeps its own default photos.
 */
public record PublicCatalogueMediaView(
        String slug,
        List<PublicMediaView> gallery,
        Map<String, List<PublicMediaView>> roomTypes) {

    public PublicCatalogueMediaView {
        gallery = List.copyOf(gallery);
        roomTypes = Map.copyOf(roomTypes);
    }
}
