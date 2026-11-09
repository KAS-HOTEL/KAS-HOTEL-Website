package com.kas.platform.shared.scope;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The application half of the {@code role_assignment} CHECK constraint in
 * doc 85 §4.4. The database refuses these combinations on write; this refuses
 * them on read, so a row predating a constraint cannot resolve to a scope that
 * reaches more than it should.
 */
class AuthorizationScopeTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();

    @Test
    @DisplayName("GLOBAL carries neither a partner nor properties")
    void globalRejectsPartnerAndProperties() {
        assertThatThrownBy(() ->
                new AuthorizationScope(ScopeKind.GLOBAL, PARTNER, Set.of(), ACTOR))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("PARTNER requires a partner id")
    void partnerRequiresPartnerId() {
        assertThatThrownBy(() ->
                new AuthorizationScope(ScopeKind.PARTNER, null, Set.of(), ACTOR))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("PARTNER and PROPERTY scopes are not combined")
    void partnerRejectsExplicitProperties() {
        assertThatThrownBy(() ->
                new AuthorizationScope(ScopeKind.PARTNER, PARTNER, Set.of(UUID.randomUUID()), ACTOR))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("OWN carries neither a partner nor properties")
    void ownRejectsPartnerAndProperties() {
        assertThatThrownBy(() ->
                new AuthorizationScope(ScopeKind.OWN, null, Set.of(UUID.randomUUID()), ACTOR))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("every scope carries an actor")
    void actorIsMandatory() {
        assertThatThrownBy(() -> AuthorizationScope.global(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("OWN reaches no property-owned record")
    void ownDoesNotReachProperties() {
        assertThat(AuthorizationScope.own(ACTOR).reachesProperties()).isFalse();
        assertThat(AuthorizationScope.global(ACTOR).reachesProperties()).isTrue();
        assertThat(AuthorizationScope.partner(ACTOR, PARTNER).reachesProperties()).isTrue();
    }

    @Test
    @DisplayName("property ids are defensively copied")
    void propertyIdsAreImmutable() {
        Set<UUID> mutable = new java.util.HashSet<>(Set.of(UUID.randomUUID()));
        AuthorizationScope scope = AuthorizationScope.property(ACTOR, mutable);

        mutable.add(UUID.randomUUID());

        assertThat(scope.propertyIds()).hasSize(1);
    }
}
