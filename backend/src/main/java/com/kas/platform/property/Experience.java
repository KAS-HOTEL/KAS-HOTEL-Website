package com.kas.platform.property;

import java.util.UUID;

/**
 * One signature experience of one property — the {@code signatureExperiences[]}
 * of doc 03 §3 and doc 23 §5, stored in {@code property_experience} since V3.
 *
 * <p>This is the record the whole publish checklist has been waiting on. Doc 52
 * §3.1, doc 60, doc 64 and doc 67 §2 all make <em>"≥1 signature experience"</em>
 * a <strong>CONFIRMED</strong> invariant, and
 * {@code PropertyCompletenessChecker} has enforced it since the gate was written
 * — but nothing could create a row, so no property could be published at all.
 *
 * <h2>Three fields, and deliberately not five</h2>
 *
 * <p>Doc 23 §5 lists five: {@code title}, {@code description}, {@code image},
 * {@code timeOfDay}, {@code sortOrder} — and is itself marked <strong>PROPOSED
 * </strong>. Step 16A.47 put the two undefined ones to the owner and the answer
 * was to omit both from V1:
 *
 * <ul>
 *   <li><strong>{@code timeOfDay} is absent.</strong> Doc 23 §5 calls it an
 *       {@code enum} and never lists a member anywhere; the column is bare
 *       {@code text} with no check. The column stays, untouched and null — this
 *       record simply does not read it, because a field the API cannot describe
 *       is a field the API should not carry.</li>
 *   <li><strong>{@code image} is absent.</strong> {@code media_owner_type} has no
 *       {@code EXPERIENCE} member, so the schema cannot link one without a
 *       migration, and OQ-106 leaves no bytes to link anyway.</li>
 * </ul>
 *
 * <p>There is no {@code status}, no {@code archived_at} and no {@code version}
 * column, so there is no lifecycle here and removal is a real delete — the same
 * shape as {@link Landmark}, for the same reason: the schema's silence is the
 * answer, not an omission to be filled in.
 */
public record Experience(
        UUID id,
        UUID propertyId,
        /** The operator's order. Not a rank — nothing reads it as importance. */
        int sortOrder) {
}
