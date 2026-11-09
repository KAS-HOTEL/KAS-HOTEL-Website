package com.kas.platform.media;

/** Matches the PostgreSQL enum {@code kas.media_status}. Applies to both assets and links. */
public enum MediaStatus {
    DRAFT,
    PUBLISHED,
    ARCHIVED;

    public boolean isPublished() {
        return this == PUBLISHED;
    }
}
