package com.kas.platform.property;

/**
 * A published property's summary row together with its editorial text.
 *
 * <h2>Why this exists rather than two more fields on {@link PublishedProperty}</h2>
 *
 * <p>{@link PublishedProperty} is the <em>list</em> row — {@code findAll} and
 * {@code findBySlug} share one mapper, so a field added there is a field added
 * to every entry of {@code GET /public/properties}. The portfolio does not need
 * a 220-character description per hotel, and doc 23 §3.2 puts
 * {@code shortDescription} on cards and comparison rather than in the list
 * payload. Composing here keeps the detail richer without widening the list.
 *
 * <h2>Why not a second query</h2>
 *
 * <p>{@code signature_line} and {@code short_description} live in
 * {@code property_translation} — the same row, already inner-joined for the
 * locale, that supplies {@code name}. They were simply never selected. Reading
 * them costs nothing beyond two more columns on a query that already runs.
 *
 * @param shortDescription doc 23 §3.2, ≤ 220 chars. {@code null} when the
 *     operator has not written one in this locale. Nullable rather than blank:
 *     the column is nullable, and a caller must be able to tell "not written"
 *     from "written as an empty string".
 * @param signatureLine doc 23 §3.2, ≤ 90 chars, same nullability.
 */
public record PublishedPropertyContent(
        PublishedProperty summary,
        String shortDescription,
        String signatureLine) {
}
