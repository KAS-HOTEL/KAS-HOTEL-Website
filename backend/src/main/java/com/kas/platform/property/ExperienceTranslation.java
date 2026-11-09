package com.kas.platform.property;

/**
 * One locale's words for a signature experience —
 * {@code property_experience_translation}, V3.
 *
 * <p>{@code title} is {@code NOT NULL} in the schema and {@code description} is
 * nullable, which is exactly the V1 contract Step 16A.47 confirmed: a title is
 * required, a description is optional. Doc 09 §Content lists signature
 * experiences among the property fields that are <em>"all localised"</em>, and
 * the table's {@code property_experience_tr_locale} check freezes the same
 * {@code vi}/{@code en} pair every other translation table uses.
 */
public record ExperienceTranslation(String title, String description) {
}
