package com.kas.platform.identity;

import java.util.EnumMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static com.kas.platform.identity.Permissions.*;

/**
 * Backend permission bundles following KAS's confirmed ADMIN/SUPER_ADMIN split.
 *
 * <p>The two staff bundles do not overlap. Each role is the highest authority over
 * its own half of the catalogue and holds nothing of the other's.
 */
public final class RoleCatalogue {

    private static final Map<UserRole, Set<String>> BUNDLES = new EnumMap<>(UserRole.class);

    static {
        // ---- CUSTOMER: own account only (doc 59 §5 row 1). --------------------
        BUNDLES.put(UserRole.CUSTOMER, Set.copyOf(SELF_SERVICE));

        // ---- ADMIN: hotels and all website content, PARTNER-scoped. ------------
        Set<String> admin = new HashSet<>();
        // ADMIN manages the public catalog and website content. Room prices, surcharges
        // and guest reviews belong to SUPER_ADMIN (owner decisions, 2026-11-08).
        admin.addAll(Set.of(PROPERTY_MANAGE, PROPERTY_DELETE, ROOMTYPE_MANAGE, AMENITY_MANAGE,
                CONTENT_MANAGE, CONTENT_PUBLISH, MEDIA_UPLOAD, MEDIA_PUBLISH, MEDIA_DELETE,
                INTEGRATION_MANAGE));
        BUNDLES.put(UserRole.ADMIN, Set.copyOf(admin));

        // ---- SUPER_ADMIN: everything ADMIN does not hold. ----------------------
        // Bookings, customers, guest reviews (hide/show/reply/delete, never rewrite),
        // vouchers, room prices, surcharges, messages and platform settings.
        Set<String> superAdmin = new HashSet<>(ALL);
        superAdmin.removeAll(admin);
        BUNDLES.put(UserRole.SUPER_ADMIN, Set.copyOf(superAdmin));
    }

    private RoleCatalogue() {
    }

    /** The permissions granted by {@code role}. Never null; never mutable. */
    public static Set<String> permissionsFor(UserRole role) {
        return BUNDLES.get(role);
    }

    /**
     * The default scope kind a role carries in V1 — doc 85 §5.2.
     *
     * <p>This is the default only. An explicit {@code role_assignment.scope_kind}
     * in the database always wins, which is what makes future property-scoped
     * roles additive.
     */
    public static com.kas.platform.shared.scope.ScopeKind defaultScopeKind(UserRole role) {
        return switch (role) {
            case SUPER_ADMIN -> com.kas.platform.shared.scope.ScopeKind.GLOBAL;
            case ADMIN -> com.kas.platform.shared.scope.ScopeKind.PARTNER;
            case CUSTOMER -> com.kas.platform.shared.scope.ScopeKind.OWN;
        };
    }
}
