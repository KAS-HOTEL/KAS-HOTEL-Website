package com.kas.platform.onboarding;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Submissions, always within the caller's scope.
 *
 * <p>A submission is scoped through its property, exactly as room types are:
 * {@code property_submission → property → partner}. Every statement joins
 * {@code property} and applies the shared {@link ScopeFilter} there, so a
 * Partner cannot read, create or decide another Partner's submission — and the
 * failure is an empty result, which the caller maps to 404.
 *
 * <p>{@link #decide} is the concurrency guard. See its comment.
 */
@Repository
public class PropertySubmissionRepository implements ScopedRepository {

    private static final String COLUMNS = """
            s.id, s.property_id, s.status, s.submitted_by, s.submitted_at,
            s.reviewed_by, s.reviewed_at, s.decision_reason
            """;

    private final JdbcClient jdbc;

    public PropertySubmissionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Opens a submission for {@code propertyId}.
     *
     * <p>The property predicate and the scope predicate are both in the INSERT's
     * SELECT, so an out-of-scope property yields no row and nothing is written.
     *
     * <p>A second open submission is refused by the V22 partial unique index
     * rather than by a prior read — a check-then-insert would leave a window in
     * which two concurrent submits both pass the check.
     */
    public Optional<UUID> create(UUID propertyId, UUID submittedBy, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(submittedBy);
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO property_submission (property_id, status, submitted_by)
                        SELECT p.id, 'SUBMITTED', ?
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    public Optional<PropertySubmission> findById(UUID submissionId, AuthorizationScope scope) {
        return querySingle("s.id = ?", submissionId, scope);
    }

    /** The one open submission for a property, if any. */
    public Optional<PropertySubmission> findOpen(UUID propertyId, AuthorizationScope scope) {
        return querySingle("s.property_id = ? AND s.status = 'SUBMITTED'", propertyId, scope);
    }

    /** Full review history, newest first. Decisions are retained, never overwritten. */
    public List<PropertySubmission> findHistory(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_submission s "
                        + "JOIN property p ON p.id = s.property_id "
                        + "WHERE s.property_id = ? AND " + filter.sql()
                        + " ORDER BY s.submitted_at DESC")
                .params(params)
                .query(PropertySubmissionRepository::map)
                .list();
    }

    /** The admin review queue, oldest first, restricted to the reviewer's scope. */
    public List<PropertySubmission> findPending(AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_submission s "
                        + "JOIN property p ON p.id = s.property_id "
                        + "WHERE s.status = 'SUBMITTED' AND " + filter.sql()
                        + " ORDER BY s.submitted_at")
                .params(filter.parameters())
                .query(PropertySubmissionRepository::map)
                .list();
    }

    /**
     * Records a decision, atomically and exactly once.
     *
     * <p><strong>The concurrency guard.</strong> {@code status = 'SUBMITTED'} is
     * part of the WHERE clause, so the transition is a compare-and-set performed
     * by the database. If two Admins approve and reject the same submission
     * simultaneously, both statements target the same row; PostgreSQL serialises
     * them, the first flips the status, and the second matches nothing and
     * returns 0. The loser is told the transition is illegal rather than
     * silently overwriting a decision that has already been acted on — which
     * matters because approval also published the property.
     *
     * @return true if this call made the decision; false if it had already been made
     */
    public boolean decide(UUID submissionId, SubmissionStatus decision, UUID reviewerId,
                          String reason, Instant at, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(decision.name());
        params.add(reviewerId);
        params.add(java.sql.Timestamp.from(at));
        params.add(reason);
        params.add(submissionId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE property_submission s
                           SET status = CAST(? AS property_submission_status),
                               reviewed_by = ?, reviewed_at = ?, decision_reason = ?,
                               updated_at = now()
                          FROM property p
                         WHERE p.id = s.property_id
                           AND s.id = ?
                           AND s.status = 'SUBMITTED'
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    private Optional<PropertySubmission> querySingle(String predicate, UUID id,
                                                     AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(id);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_submission s "
                        + "JOIN property p ON p.id = s.property_id "
                        + "WHERE " + predicate + " AND " + filter.sql())
                .params(params)
                .query(PropertySubmissionRepository::map)
                .optional();
    }

    private static PropertySubmission map(ResultSet rs, int rowNum) throws SQLException {
        return new PropertySubmission(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                SubmissionStatus.valueOf(rs.getString("status")),
                rs.getObject("submitted_by", UUID.class),
                rs.getTimestamp("submitted_at").toInstant(),
                rs.getObject("reviewed_by", UUID.class),
                rs.getTimestamp("reviewed_at") == null
                        ? null : rs.getTimestamp("reviewed_at").toInstant(),
                rs.getString("decision_reason"));
    }
}
