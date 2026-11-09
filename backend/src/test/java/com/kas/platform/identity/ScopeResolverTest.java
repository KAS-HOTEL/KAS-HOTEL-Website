package com.kas.platform.identity;

import com.kas.platform.shared.scope.ScopeKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScopeResolverTest {

    private final ScopeResolver resolver = new ScopeResolver();

    private static final UUID USER = UUID.randomUUID();
    private static final UUID PARTNER_A = UUID.randomUUID();
    private static final UUID PARTNER_B = UUID.randomUUID();

    @Test
    @DisplayName("a user with no active assignment gets nothing — deny by default")
    void noAssignmentsGrantsNothing() {
        ResolvedActor actor = resolver.resolve(user(), List.of());

        assertThat(actor.permissions()).isEmpty();
        assertThat(actor.scope().kind()).isEqualTo(ScopeKind.OWN);
        assertThat(actor.scope().reachesProperties()).isFalse();
    }

    @Test
    @DisplayName("a revoked assignment grants nothing")
    void revokedAssignmentGrantsNothing() {
        RoleAssignment revoked = new RoleAssignment(UUID.randomUUID(), USER, UserRole.SUPER_ADMIN,
                ScopeKind.GLOBAL, null, Set.of(), Instant.now(), Instant.now());

        ResolvedActor actor = resolver.resolve(user(), List.of(revoked));

        assertThat(actor.permissions()).isEmpty();
        assertThat(actor.scope().kind()).isEqualTo(ScopeKind.OWN);
    }

    @Test
    @DisplayName("ADMIN resolves to PARTNER scope — doc 85 §5.2")
    void adminResolvesToPartnerScope() {
        ResolvedActor actor = resolver.resolve(user(),
                List.of(assignment(UserRole.ADMIN, ScopeKind.PARTNER, PARTNER_A, Set.of())));

        assertThat(actor.scope().kind()).isEqualTo(ScopeKind.PARTNER);
        assertThat(actor.scope().partnerId()).isEqualTo(PARTNER_A);
        assertThat(actor.has(Permissions.PROPERTY_MANAGE)).isTrue();
        assertThat(actor.has(Permissions.RESERVATION_VIEW)).isFalse();
    }

    @Test
    @DisplayName("SUPER_ADMIN resolves to GLOBAL scope")
    void superAdminResolvesToGlobal() {
        ResolvedActor actor = resolver.resolve(user(),
                List.of(assignment(UserRole.SUPER_ADMIN, ScopeKind.GLOBAL, null, Set.of())));

        assertThat(actor.scope().kind()).isEqualTo(ScopeKind.GLOBAL);
        assertThat(actor.has(Permissions.AUDIT_VIEW)).isTrue();
    }

    @Test
    @DisplayName("GLOBAL wins over a narrower assignment held at the same time")
    void globalWinsOverPartner() {
        ResolvedActor actor = resolver.resolve(user(), List.of(
                assignment(UserRole.ADMIN, ScopeKind.PARTNER, PARTNER_A, Set.of()),
                assignment(UserRole.SUPER_ADMIN, ScopeKind.GLOBAL, null, Set.of())));

        assertThat(actor.scope().kind()).isEqualTo(ScopeKind.GLOBAL);
    }

    @Test
    @DisplayName("PROPERTY assignments union their properties")
    void propertyAssignmentsUnion() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        ResolvedActor actor = resolver.resolve(user(), List.of(
                assignment(UserRole.ADMIN, ScopeKind.PROPERTY, null, Set.of(first)),
                assignment(UserRole.ADMIN, ScopeKind.PROPERTY, null, Set.of(second))));

        assertThat(actor.scope().kind()).isEqualTo(ScopeKind.PROPERTY);
        assertThat(actor.scope().propertyIds()).containsExactlyInAnyOrder(first, second);
    }

    @Test
    @DisplayName("scope across two partners is refused, not silently resolved")
    void crossPartnerScopeIsRefused() {
        List<RoleAssignment> assignments = List.of(
                assignment(UserRole.ADMIN, ScopeKind.PARTNER, PARTNER_A, Set.of()),
                assignment(UserRole.ADMIN, ScopeKind.PARTNER, PARTNER_B, Set.of()));

        // Picking either partner would be a guess, and picking both would be a
        // cross-partner leak. V1 has exactly one partner (doc 85 §1), so this is
        // a data defect and must be visible rather than absorbed.
        assertThatThrownBy(() -> resolver.resolve(user(), assignments))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Cross-partner scope");
    }

    @Test
    @DisplayName("a CUSTOMER holds only own-account permissions")
    void customerHoldsOnlySelfService() {
        ResolvedActor actor = resolver.resolve(user(),
                List.of(assignment(UserRole.CUSTOMER, ScopeKind.OWN, null, Set.of())));

        assertThat(actor.has(Permissions.ME_STAY_VIEW)).isTrue();
        assertThat(actor.has(Permissions.REVIEW_CREATE)).isTrue();
        assertThat(actor.has(Permissions.RESERVATION_VIEW)).isFalse();
        assertThat(actor.has(Permissions.CUSTOMER_VIEW)).isFalse();
    }

    private static AppUser user() {
        return new AppUser(USER, "staff@example.test", UserStatus.ACTIVE, false, "en", Instant.now(), null);
    }

    private static RoleAssignment assignment(UserRole role, ScopeKind kind,
                                             UUID partnerId, Set<UUID> propertyIds) {
        return new RoleAssignment(UUID.randomUUID(), USER, role, kind,
                partnerId, propertyIds, Instant.now(), null);
    }
}
