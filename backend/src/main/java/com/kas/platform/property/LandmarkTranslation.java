package com.kas.platform.property;

/**
 * One locale's text for a landmark — {@code property_landmark_translation}.
 *
 * <p>{@code name} is {@code NOT NULL} in the schema; {@code description} is
 * optional, and null means "not written" rather than "written as nothing".
 */
public record LandmarkTranslation(String name, String description) {
}
