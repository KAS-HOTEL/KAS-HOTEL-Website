package com.kas.platform.property;

/**
 * A room type's Partner-authored content in one locale — {@code room_type_translation}.
 *
 * <p>Only the two fields the API can actually write. {@code POST} and
 * {@code PATCH /admin/properties/{id}/room-types} take a {@code name} and a
 * {@code shortDescription}; {@code long_description} is a column no endpoint
 * sets, so it is not read back either — a field nobody can fill reads as a gap in
 * the product rather than a gap in the API.
 *
 * <p>{@code name} is {@code NOT NULL} in the schema, so a translation row always
 * has one. {@code shortDescription} is nullable and stays nullable here.
 */
public record RoomTypeTranslation(String name, String shortDescription) {
}
