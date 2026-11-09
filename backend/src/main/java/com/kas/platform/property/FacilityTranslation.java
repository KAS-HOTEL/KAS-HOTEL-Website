package com.kas.platform.property;

/**
 * One locale's text for a facility — {@code facility_translation}.
 *
 * <p>{@code name} is {@code NOT NULL} with a non-blank check in the schema;
 * {@code description} is optional, and null means "not written" rather than
 * "written as nothing".
 */
public record FacilityTranslation(String name, String description) {
}
