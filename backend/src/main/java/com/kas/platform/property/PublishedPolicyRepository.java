package com.kas.platform.property;

import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * The policies a guest sees for a published property.
 *
 * <p>Implements {@link PublicReadRepository}: a guest has no scope, so the
 * filter is publication state. Three conditions, all in SQL:
 *
 * <ol>
 *   <li>the owning property is publicly visible — doc 03 §8;</li>
 *   <li>the policy version is {@code ACTIVE};</li>
 *   <li>its {@code effective_from} has arrived.</li>
 * </ol>
 *
 * <p>A {@code DRAFT} policy on a live property is invisible, and so is an
 * {@code ACTIVE} one dated next month. Exactly one version of each type is
 * returned, chosen by {@code DISTINCT ON} over the same ordering the repository
 * documents as "current".
 *
 * <h2>On {@code current_date}</h2>
 *
 * <p>{@code effective_from} is a {@code date} with no time and no zone, and no
 * frozen document establishes a timezone convention — so this compares against
 * the database's {@code current_date}. For a single-region operator that is
 * unambiguous in practice, but it is not <em>specified</em>, and a policy
 * changing at midnight in the wrong zone is a real if narrow edge. Recorded as
 * OQ-112 rather than resolved by picking a zone here.
 */
@Repository
public class PublishedPolicyRepository implements PublicReadRepository {

    private static final String PROPERTY_PUBLICLY_VISIBLE =
            "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";

    private final JdbcClient jdbc;

    public PublishedPolicyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The current version of every policy type this property publishes. */
    public List<PublicPolicyView> forProperty(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT DISTINCT ON (pp.policy_type)
                               pp.policy_type, pp.version, t.summary, t.body
                          FROM property_policy pp
                          JOIN property p ON p.id = pp.property_id
                          LEFT JOIN property_policy_translation t
                                 ON t.policy_id = pp.id AND t.locale = :locale
                         WHERE p.slug = :slug
                           AND pp.status = 'ACTIVE'
                           AND pp.effective_from <= current_date
                           AND %s
                         ORDER BY pp.policy_type, pp.effective_from DESC, pp.version DESC
                        """.formatted(PROPERTY_PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublicPolicyView(
                        PolicyType.valueOf(rs.getString("policy_type")),
                        rs.getInt("version"),
                        rs.getString("summary"),
                        rs.getString("body")))
                .list();
    }
}
