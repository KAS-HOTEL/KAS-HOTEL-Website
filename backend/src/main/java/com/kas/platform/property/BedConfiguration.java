package com.kas.platform.property;

/**
 * One bed arrangement within a room type — {@code room_type_bed_config}.
 *
 * <p>A room type may have several: "1 King" and "2 Twin" are two configurations
 * of the same sellable product, which is why this is a child table and not a
 * column. {@code isDefault} marks the one shown first.
 *
 * <p><strong>{@code bedType} is free text, deliberately.</strong> The column is
 * {@code text} with only a non-blank CHECK — there is no {@code bed_type} enum
 * and no bed catalogue anywhere in the frozen schema. The phase brief says to use
 * a controlled catalogue "if the database already has one"; it does not, and
 * inventing one would freeze a vocabulary nobody has approved. Recorded as
 * OQ-102 in doc 94.
 */
public record BedConfiguration(
        String bedType,
        int bedCount,
        boolean isDefault,
        int sortOrder) {
}
