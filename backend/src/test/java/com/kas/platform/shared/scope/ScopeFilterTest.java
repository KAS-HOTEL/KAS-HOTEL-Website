package com.kas.platform.shared.scope;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The security property of the shared scope filter:
 * <strong>only {@code GLOBAL} may produce an unfiltered predicate.</strong>
 */
class ScopeFilterTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();

    @ParameterizedTest
    @EnumSource(ScopeKind.class)
    @DisplayName("only GLOBAL is unrestricted — every other scope narrows or refuses")
    void onlyGlobalIsUnrestricted(ScopeKind kind) {
        ScopeFilter filter = ScopeFilter.forProperties(scopeOf(kind), "p.partner_id", "p.id");

        if (kind == ScopeKind.GLOBAL) {
            assertThat(filter.isUnrestricted()).isTrue();
        } else {
            assertThat(filter.isUnrestricted())
                    .as("%s must never produce an unfiltered predicate", kind)
                    .isFalse();
        }
    }

    @Test
    @DisplayName("PARTNER filters on partner_id, parameterised")
    void partnerScopeFiltersOnPartnerId() {
        ScopeFilter filter = ScopeFilter.forProperties(
                AuthorizationScope.partner(ACTOR, PARTNER), "p.partner_id", "p.id");

        assertThat(filter.sql()).isEqualTo("p.partner_id = ?");
        assertThat(filter.parameters()).containsExactly(PARTNER);
    }

    @Test
    @DisplayName("PROPERTY filters on an IN-list with one placeholder per property")
    void propertyScopeFiltersOnPropertyIds() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        ScopeFilter filter = ScopeFilter.forProperties(
                AuthorizationScope.property(ACTOR, Set.of(first, second)), "p.partner_id", "p.id");

        assertThat(filter.sql()).isEqualTo("p.id IN (?, ?)");
        assertThat(filter.parameters()).containsExactlyInAnyOrder(first, second);
    }

    @Test
    @DisplayName("PROPERTY with no properties reaches nothing, rather than everything")
    void emptyPropertyScopeMatchesNothing() {
        ScopeFilter filter = ScopeFilter.forProperties(
                AuthorizationScope.property(ACTOR, Set.of()), "p.partner_id", "p.id");

        assertThat(filter.matchesNothing()).isTrue();
        assertThat(filter.isUnrestricted()).isFalse();
    }

    @Test
    @DisplayName("OWN reaches no property — a customer has no admin reach")
    void ownScopeMatchesNothing() {
        ScopeFilter filter = ScopeFilter.forProperties(
                AuthorizationScope.own(ACTOR), "p.partner_id", "p.id");

        assertThat(filter.matchesNothing()).isTrue();
    }

    @ParameterizedTest
    @EnumSource(ScopeKind.class)
    @DisplayName("no scope ever inlines an identifier into SQL")
    void identifiersAreAlwaysParameterised(ScopeKind kind) {
        ScopeFilter filter = ScopeFilter.forProperties(scopeOf(kind), "p.partner_id", "p.id");

        // A UUID appearing literally in the SQL would mean string concatenation
        // reached the query. Doc 58 §10 permits parameterised queries only.
        assertThat(filter.sql()).doesNotContain(PARTNER.toString());
        assertThat(filter.sql().chars().filter(c -> c == '?').count())
                .isEqualTo(filter.parameters().size());
    }

    private static AuthorizationScope scopeOf(ScopeKind kind) {
        return switch (kind) {
            case GLOBAL -> AuthorizationScope.global(ACTOR);
            case PARTNER -> AuthorizationScope.partner(ACTOR, PARTNER);
            case PROPERTY -> AuthorizationScope.property(ACTOR, Set.of(UUID.randomUUID()));
            case OWN -> AuthorizationScope.own(ACTOR);
        };
    }
}
