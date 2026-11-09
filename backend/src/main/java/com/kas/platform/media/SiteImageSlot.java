package com.kas.platform.media;

/** Website image slot and its selected or fallback image reference. */
public record SiteImageSlot(
        String key,
        String group,
        String label,
        String selector,
        String defaultReference,
        String currentReference,
        String imageReference,
        boolean enabled,
        int sortOrder) {
}
