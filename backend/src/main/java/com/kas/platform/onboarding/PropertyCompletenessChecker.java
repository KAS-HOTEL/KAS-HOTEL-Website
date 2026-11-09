package com.kas.platform.onboarding;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Decides whether a property may be submitted.
 *
 * <h2>The rule is frozen, not invented</h2>
 *
 * <p>Doc 52 §3.1 states the property invariant verbatim:
 *
 * <blockquote>Publishable only with hero image, signature line, both-locale
 * descriptions, address, ≥1 published room type, ≥1 signature experience.</blockquote>
 *
 * <p>Those six are exactly the checks below, and <strong>nothing else is
 * required</strong>. Star rating, coordinates, year opened, total room count,
 * email, Zalo, check-in times, rates and policies are all deliberately optional
 * here: the brief forbids inventing mandatory business fields, and doc 52 §3.1 is
 * the only frozen statement of what publication demands.
 *
 * <p>Checked at <em>submit</em> rather than at approve because approval publishes
 * in the same transaction — by then it is too late to tell the Partner what is
 * missing.
 *
 * <p>A room type must merely <em>exist</em> at submit time. Doc 52 §3.1 says
 * "published room type", and room types are published by the approval itself
 * (they are created {@code DRAFT}), so requiring published rooms before approval
 * would be unsatisfiable.
 *
 * <h2>A hero image means an image, not a record of one</h2>
 *
 * <p>The hero check counts cover links whose asset has a {@code checksum}. Until
 * Step 16A.49 there was no way to upload bytes at all, so counting the link was
 * the most the check could do; now that {@code POST /admin/media/upload-url} and
 * {@code /complete} exist, a cover can point at an asset whose file was never
 * sent — and the property would have passed this gate and shown a guest nothing.
 *
 * <p>{@code checksum} is the right field and no new one was added:
 * {@code MediaRepository.recordUpload} is its only writer, reached only from
 * {@code MediaService.completeUpload}, and {@code RegisterMediaRequest} has no
 * field for it. So a non-null checksum means the platform read the stored object
 * itself. <strong>{@code size_bytes} would not do</strong> — a client may declare
 * that at registration, so it can be present with no file behind it.
 *
 * <p>This is a data-integrity correction rather than a new rule: doc 52 §3.1 says
 * "hero image", and a descriptor with no bytes is not one. Nothing about the
 * cover invariant, alt text or scoping changed.
 */
@Component
public class PropertyCompletenessChecker {

    private final JdbcClient jdbc;

    public PropertyCompletenessChecker(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @return empty when the property does not exist or is out of scope — the
     *         caller maps that to 404, never to "incomplete"
     */
    public Optional<CompletenessResult> check(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT
                          (SELECT count(*) FROM property_translation t
                            WHERE t.property_id = p.id AND t.locale IN ('en','vi')
                              AND t.name IS NOT NULL AND length(btrim(t.name)) > 0)      AS names,
                          (SELECT count(*) FROM property_translation t
                            WHERE t.property_id = p.id AND t.locale IN ('en','vi')
                              AND t.short_description IS NOT NULL
                              AND length(btrim(t.short_description)) > 0)                AS descriptions,
                          (SELECT count(*) FROM property_translation t
                            WHERE t.property_id = p.id AND t.signature_line IS NOT NULL
                              AND length(btrim(t.signature_line)) > 0)                   AS signature_lines,
                          (SELECT count(*) FROM room_type rt
                            WHERE rt.property_id = p.id AND rt.archived_at IS NULL)      AS room_types,
                          (SELECT count(*) FROM media_link ml
                             JOIN media_asset ma ON ma.id = ml.media_asset_id
                            WHERE ml.owner_type = 'PROPERTY' AND ml.owner_id = p.id
                              AND ml.is_cover
                              AND ma.checksum IS NOT NULL
                              AND ma.archived_at IS NULL)                                AS hero_images,
                          (SELECT count(*) FROM property_experience pe
                            WHERE pe.property_id = p.id)                                 AS experiences,
                          p.district, p.ward, p.city
                        FROM property p
                        WHERE p.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, rowNum) -> build(
                        rs.getLong("names"),
                        rs.getLong("descriptions"),
                        rs.getLong("signature_lines"),
                        rs.getLong("room_types"),
                        rs.getLong("hero_images"),
                        rs.getLong("experiences"),
                        rs.getString("district"),
                        rs.getString("ward"),
                        rs.getString("city")))
                .optional();
    }

    private static CompletenessResult build(long names, long descriptions, long signatureLines,
                                            long roomTypes, long heroImages, long experiences,
                                            String district, String ward, String city) {
        List<CompletenessResult.Section> sections = new ArrayList<>();

        // "both-locale descriptions" — doc 52 §3.1. Both locales, name and summary.
        List<String> identity = new ArrayList<>();
        if (names < 2) {
            identity.add("name (both locales)");
        }
        if (descriptions < 2) {
            identity.add("shortDescription (both locales)");
        }
        if (signatureLines < 1) {
            identity.add("signatureLine");
        }
        sections.add(CompletenessResult.Section.of("Basic information", identity));

        List<String> location = new ArrayList<>();
        if (isBlank(city)) {
            location.add("city");
        }
        if (isBlank(district)) {
            location.add("district");
        }
        if (isBlank(ward)) {
            location.add("ward");
        }
        sections.add(CompletenessResult.Section.of("Location", location));

        sections.add(CompletenessResult.Section.of("Room types",
                roomTypes < 1 ? List.of("at least one room type") : List.of()));

        sections.add(CompletenessResult.Section.of("Property images",
                heroImages < 1 ? List.of("hero image") : List.of()));

        sections.add(CompletenessResult.Section.of("Signature experiences",
                experiences < 1 ? List.of("at least one signature experience") : List.of()));

        return new CompletenessResult(sections);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
