package com.kas.platform.shared.scope;

import java.util.List;

/**
 * The single shared scope filter applied at the repository boundary.
 *
 * <p>Doc 85 §5.4 states the reason this exists as one mechanism rather than a
 * per-query convention:
 *
 * <blockquote>Because the filter is a single shared mechanism, this is one
 * change, not a per-query audit — which is the entire reason for adding the
 * scope now rather than later.</blockquote>
 *
 * <p>The security property this type carries, asserted by
 * {@code ScopeFilterTest}: <strong>only {@link ScopeKind#GLOBAL} may produce an
 * unfiltered predicate.</strong> Every other kind emits either a parameterised
 * predicate or {@code FALSE}. There is no code path that silently widens.
 *
 * @param sql        a boolean SQL fragment, safe to {@code AND} into a WHERE clause
 * @param parameters positional parameters for {@code sql}, in order
 */
public record ScopeFilter(String sql, List<Object> parameters) {

    private static final ScopeFilter UNRESTRICTED = new ScopeFilter("TRUE", List.of());
    private static final ScopeFilter NOTHING = new ScopeFilter("FALSE", List.of());

    public ScopeFilter {
        parameters = List.copyOf(parameters);
    }

    /**
     * Build the predicate restricting a property-owned table to {@code scope}.
     *
     * <p>Column names are supplied by the calling repository and are never taken
     * from request input — doc 58 §2 permits explicit named parameters only, and
     * no arbitrary query passthrough.
     *
     * @param partnerIdColumn  the qualified column holding the owning partner
     * @param propertyIdColumn the qualified column holding the property identity
     */
    public static ScopeFilter forProperties(AuthorizationScope scope,
                                            String partnerIdColumn,
                                            String propertyIdColumn) {
        return switch (scope.kind()) {
            case GLOBAL -> UNRESTRICTED;
            case PARTNER -> new ScopeFilter(partnerIdColumn + " = ?", List.of(scope.partnerId()));
            case PROPERTY -> scope.propertyIds().isEmpty()
                    ? NOTHING
                    : new ScopeFilter(
                            propertyIdColumn + " IN (" + placeholders(scope.propertyIds().size()) + ")",
                            List.copyOf(scope.propertyIds()));
            // A customer has no property reach. This is a refusal, not an oversight.
            case OWN -> NOTHING;
        };
    }

    /**
     * An IN-list of positional placeholders.
     *
     * <p>Deliberately an IN-list rather than {@code = ANY(?)}: the count is
     * small (eight properties in V1) and an IN-list needs no array type
     * plumbing, so the generated SQL stays inspectable. {@code count} is a
     * collection size, never request input.
     */
    private static String placeholders(int count) {
        return String.join(", ", java.util.Collections.nCopies(count, "?"));
    }

    /** True when this filter restricts nothing. Only GLOBAL may produce it. */
    public boolean isUnrestricted() {
        return UNRESTRICTED.sql().equals(sql);
    }

    /** True when this filter can match no row at all. */
    public boolean matchesNothing() {
        return NOTHING.sql().equals(sql);
    }
}
