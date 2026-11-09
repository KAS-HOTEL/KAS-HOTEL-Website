package com.kas.platform.property;

/**
 * One bed arrangement in a published room type.
 *
 * <p>{@code bedType} is the Partner's own text, not a controlled vocabulary —
 * {@code room_type_bed_config.bed_type} is a free {@code text} column — so it is
 * returned verbatim rather than mapped to a category the schema does not have.
 *
 * <p>{@code isDefault} marks the arrangement a guest gets unless they ask
 * otherwise. A room type may offer "1 giường đôi" or "2 giường đơn"; both are
 * real, and which is standard is the thing a guest needs to know.
 */
public record PublishedBed(String bedType, int bedCount, boolean isDefault) {
}
