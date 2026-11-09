package com.kas.platform.property;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.PublicReadRepository;
import com.kas.platform.shared.scope.ScopeFilter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Reads the shared trip-intent taxonomy and manages property assignments. */
@Repository
public class TripIntentRepository implements PublicReadRepository {

    private static final String PUBLICLY_VISIBLE =
            "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";

    private final JdbcClient jdbc;

    public TripIntentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Returns every active editorial group and only its publicly visible hotels. */
    public List<PublicTripIntent> findPublic(String locale) {
        Map<String, MutableIntent> grouped = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT i.code, t.label, t.description, p.slug
                          FROM trip_intent i
                          JOIN trip_intent_translation t
                            ON t.intent_code = i.code AND t.locale = :locale
                          LEFT JOIN property_trip_intent pi ON pi.intent_code = i.code
                          LEFT JOIN property p
                            ON p.id = pi.property_id AND %s
                         ORDER BY i.sort_order, p.sort_order NULLS LAST, p.slug
                        """.formatted(PUBLICLY_VISIBLE))
                .param("locale", locale)
                .query((rs, rowNum) -> new IntentRow(
                        rs.getString("code"), rs.getString("label"),
                        rs.getString("description"), rs.getString("slug")))
                .list()
                .forEach(row -> {
                    MutableIntent intent = grouped.computeIfAbsent(row.code(), ignored ->
                            new MutableIntent(row.code(), row.label(), row.description()));
                    if (row.slug() != null) intent.slugs().add(row.slug());
                });
        return grouped.values().stream()
                .map(i -> new PublicTripIntent(i.code(), i.label(), i.description(), i.slugs()))
                .toList();
    }

    /** Batch reads assignments for a caller-scoped property list. */
    public Map<UUID, List<String>> findCodes(Collection<UUID> propertyIds,
                                             AuthorizationScope scope) {
        if (propertyIds.isEmpty()) return Map.of();
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>(propertyIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ",
                java.util.Collections.nCopies(propertyIds.size(), "?"));
        Map<UUID, List<String>> result = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT pi.property_id, pi.intent_code
                          FROM property_trip_intent pi
                          JOIN property p ON p.id = pi.property_id
                         WHERE pi.property_id IN (%s) AND %s
                         ORDER BY pi.property_id, pi.sort_order, pi.intent_code
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Assignment(
                        rs.getObject("property_id", UUID.class), rs.getString("intent_code")))
                .list()
                .forEach(a -> result.computeIfAbsent(a.propertyId(), ignored -> new ArrayList<>())
                        .add(a.code()));
        return Map.copyOf(result);
    }

    /** The selected groups for one property, returning empty for an out-of-scope id. */
    public List<String> findCodes(UUID propertyId, AuthorizationScope scope) {
        return findCodes(List.of(propertyId), scope).getOrDefault(propertyId, List.of());
    }

    /** Which requested keys exist in the shared taxonomy. */
    public Set<String> knownCodes(Collection<String> codes) {
        if (codes.isEmpty()) return Set.of();
        return Set.copyOf(jdbc.sql("SELECT code FROM trip_intent WHERE code IN (:codes)")
                .param("codes", codes)
                .query(String.class)
                .list());
    }

    /** Replaces a property's full assignment in the order supplied. */
    public void replace(UUID propertyId, List<String> codes, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());
        boolean inScope = jdbc.sql("SELECT EXISTS (SELECT 1 FROM property p "
                        + "WHERE p.id = ? AND " + filter.sql() + ")")
                .params(params)
                .query(Boolean.class)
                .single();
        if (!inScope) return;

        jdbc.sql("DELETE FROM property_trip_intent WHERE property_id = :id")
                .param("id", propertyId)
                .update();
        for (int index = 0; index < codes.size(); index++) {
            jdbc.sql("INSERT INTO property_trip_intent (property_id, intent_code, sort_order) "
                            + "VALUES (:propertyId, :code, :sortOrder)")
                    .param("propertyId", propertyId)
                    .param("code", codes.get(index))
                    .param("sortOrder", index + 1)
                    .update();
        }
    }

    private record IntentRow(String code, String label, String description, String slug) { }
    private record Assignment(UUID propertyId, String code) { }
    private record MutableIntent(String code, String label, String description,
                                 List<String> slugs) {
        private MutableIntent(String code, String label, String description) {
            this(code, label, description, new ArrayList<>());
        }
    }
}
