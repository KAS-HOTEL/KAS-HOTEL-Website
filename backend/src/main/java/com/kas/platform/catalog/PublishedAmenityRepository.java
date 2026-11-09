package com.kas.platform.catalog;

import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * The guest-readable amenity vocabulary — doc 58 §3.1's
 * {@code GET /public/amenities}.
 *
 * <h2>Unscoped on purpose</h2>
 *
 * <p>There is no partner predicate here and none is missing. Doc 03 §6 makes the
 * catalogue a vocabulary <em>shared across all properties</em>: it belongs to
 * nobody, so there is nothing to scope it to. The publication predicate every
 * other public query carries has no analogue either — an amenity is not
 * published, it simply exists or is archived.
 *
 * <h2>The translation join is inner, and that is the whole story today</h2>
 *
 * <p>An amenity with no name in the reader's locale is <strong>omitted</strong>,
 * exactly as {@code PublishedPropertyRepository.findAmenities} omits it on the
 * property detail. A guest is never shown {@code lift-access}, and a fallback —
 * title-casing the code, or serving Vietnamese to an English reader — would be
 * this repository inventing a label nobody approved.
 *
 * <p>So this returns <strong>an empty list today</strong>:
 * {@code amenity_translation} has no rows, because the amenity wording is config
 * <strong>A9 / OQ-031</strong> and still unsupplied. That is the correct answer,
 * not a failure — and the day the owner seeds labels, every caller gets them with
 * no code change.
 */
@Repository
public class PublishedAmenityRepository implements PublicReadRepository {

    private final JdbcClient jdbc;

    public PublishedAmenityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The named, unarchived vocabulary in one locale.
     *
     * <p>Ordered {@code category, sort_order, code} — the same order the admin
     * catalogue uses, so an operator and a guest see the vocabulary arranged
     * identically.
     */
    public List<PublicAmenity> findAll(String locale) {
        return jdbc.sql("""
                        SELECT a.code, t.name, a.category
                          FROM amenity a
                          JOIN amenity_translation t
                            ON t.amenity_id = a.id AND t.locale = :locale
                         WHERE a.archived_at IS NULL
                         ORDER BY a.category, a.sort_order, a.code
                        """)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublicAmenity(
                        rs.getString("code"),
                        rs.getString("name"),
                        rs.getString("category")))
                .list();
    }
}
