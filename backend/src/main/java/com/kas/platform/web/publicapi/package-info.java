/**
 * Response types for the Public Customer surface, {@code /api/v1/public/**}.
 *
 * <p><strong>Every type in this package is scanned, at any nesting depth,
 * against the doc 58 §9 denylist by {@code PublicResponseDenylistTest}.</strong>
 * The package exists now, before it has contents, so the guard is armed for the
 * first public DTO rather than added after one has already leaked.
 *
 * <p>Doc 58 §9 layer 2 sets the standard these types must meet:
 *
 * <blockquote>{@code RoomTypePublicView} <strong>has no field</strong> capable
 * of carrying a room number. Leaking is not a matter of forgetting to filter;
 * the field does not exist.</blockquote>
 *
 * <p>Doc 58 §9 layer 3: mapping is by explicit mapper, never object spread and
 * never a domain entity returned directly. A domain record gaining a field must
 * not be able to surface it here.
 */
package com.kas.platform.web.publicapi;
