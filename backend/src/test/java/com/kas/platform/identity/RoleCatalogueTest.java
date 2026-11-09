package com.kas.platform.identity;

import com.kas.platform.shared.scope.ScopeKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The V1 role bundles against doc 59 §5, cell by cell.
 *
 * <p>The negative assertions matter more than the positive ones: an
 * over-granted bundle is a privilege escalation that no other test would catch.
 */
class RoleCatalogueTest {

    @Test
    @DisplayName("every granted permission exists in the frozen catalogue")
    void bundlesGrantOnlyCataloguedPermissions() {
        for (UserRole role : UserRole.values()) {
            assertThat(Permissions.ALL)
                    .as("%s grants only permissions from doc 59 §4", role)
                    .containsAll(RoleCatalogue.permissionsFor(role));
        }
    }

    @Test
    @DisplayName("ADMIN and SUPER_ADMIN split the whole catalogue with no overlap")
    void staffRolesPartitionTheCatalogue() {
        Set<String> admin = RoleCatalogue.permissionsFor(UserRole.ADMIN);
        Set<String> superAdmin = RoleCatalogue.permissionsFor(UserRole.SUPER_ADMIN);

        assertThat(admin).doesNotContainAnyElementsOf(superAdmin);
        assertThat(superAdmin).doesNotContainAnyElementsOf(admin);
        assertThat(java.util.stream.Stream.concat(admin.stream(), superAdmin.stream()).toList())
                .containsExactlyInAnyOrderElementsOf(Permissions.ALL);
    }

    @Test
    @DisplayName("CUSTOMER holds own-account permissions and nothing else")
    void customerHoldsOnlySelfService() {
        Set<String> customer = RoleCatalogue.permissionsFor(UserRole.CUSTOMER);

        assertThat(customer).contains(
                Permissions.ME_PROFILE_EDIT, Permissions.ME_STAY_VIEW,
                Permissions.ME_STAY_CANCEL, Permissions.REVIEW_CREATE);
        assertThat(customer).doesNotContain(
                Permissions.RESERVATION_VIEW, Permissions.INVENTORY_VIEW,
                Permissions.CUSTOMER_VIEW, Permissions.SALES_REQUEST_VIEW);
    }

    @Test
    @DisplayName("ADMIN manages catalog, room types, content and media")
    void adminHoldsContentPermissions() {
        Set<String> admin = RoleCatalogue.permissionsFor(UserRole.ADMIN);

        assertThat(admin).contains(
                Permissions.PROPERTY_MANAGE, Permissions.ROOMTYPE_MANAGE, Permissions.MEDIA_PUBLISH);
    }

    @Test
    @DisplayName("guest reviews belong to SUPER_ADMIN, not ADMIN (2026-11-08)")
    void reviewsAreSuperAdminOnly() {
        assertThat(RoleCatalogue.permissionsFor(UserRole.ADMIN)).doesNotContain(
                Permissions.REVIEW_MODERATE, Permissions.REVIEW_REPLY, Permissions.REVIEW_DELETE);
        assertThat(RoleCatalogue.permissionsFor(UserRole.SUPER_ADMIN)).contains(
                Permissions.REVIEW_MODERATE, Permissions.REVIEW_REPLY, Permissions.REVIEW_DELETE);
    }

    @Test
    @DisplayName("room prices and surcharges belong to SUPER_ADMIN, not ADMIN (2026-11-08)")
    void pricesAndSurchargesAreSuperAdminOnly() {
        assertThat(RoleCatalogue.permissionsFor(UserRole.ADMIN))
                .doesNotContain(Permissions.RATE_VIEW, Permissions.RATE_MANAGE, Permissions.SURCHARGE_MANAGE);
        assertThat(RoleCatalogue.permissionsFor(UserRole.SUPER_ADMIN))
                .contains(Permissions.RATE_VIEW, Permissions.RATE_MANAGE, Permissions.SURCHARGE_MANAGE);
    }

    @Test
    @DisplayName("ADMIN does not hold the SUPER_ADMIN-only permissions")
    void adminDoesNotHoldPlatformAdministration() {
        Set<String> admin = RoleCatalogue.permissionsFor(UserRole.ADMIN);

        assertThat(admin).doesNotContain(
                // doc 59 §5: platform administration is SUPER_ADMIN only
                Permissions.USER_MANAGE, Permissions.ROLE_MANAGE,
                Permissions.SETTINGS_MANAGE, Permissions.AUDIT_VIEW,
                Permissions.EMAIL_CAMPAIGN_SEND,
                // doc 59 §4.4: tax rules are GLOBAL scope
                Permissions.RATE_TAX_MANAGE,
                // Customer data and all customer administration are SUPER_ADMIN only.
                Permissions.CUSTOMER_VIEW, Permissions.CUSTOMER_EDIT,
                Permissions.CUSTOMER_MERGE, Permissions.CUSTOMER_ANONYMISE,
                Permissions.CUSTOMER_EXPORT,
                // Other business and platform operations are SUPER_ADMIN only.
                Permissions.RESERVATION_VIEW, Permissions.VOUCHER_MANAGE,
                Permissions.NOTIFICATION_MANAGE, Permissions.EMAIL_MANAGE,
                Permissions.RESERVATION_PRICE_OVERRIDE,
                Permissions.ME_PROFILE_EDIT, Permissions.ME_STAY_VIEW, Permissions.REVIEW_CREATE);
    }

    @Test
    @DisplayName("ADMIN cannot override reservation prices")
    void adminCannotOverrideReservationPrices() {
        assertThat(RoleCatalogue.permissionsFor(UserRole.ADMIN))
                .doesNotContain(Permissions.RESERVATION_PRICE_OVERRIDE);
    }

    @Test
    @DisplayName("ADMIN does not hold financial analytics — doc 59 §4.7 names the holders")
    void adminDoesNotHoldFinancialAnalytics() {
        // Doc 59 §5 marks this cell "▲", but §4.7 lists the holders explicitly as
        // SUPER_ADMIN and the future ACCOUNTANT. Deny by default (§7.1) resolves
        // the ambiguity by withholding rather than granting.
        assertThat(RoleCatalogue.permissionsFor(UserRole.ADMIN))
                .doesNotContain(Permissions.ANALYTICS_FINANCIAL_VIEW);
        assertThat(RoleCatalogue.permissionsFor(UserRole.SUPER_ADMIN))
                .contains(Permissions.ANALYTICS_FINANCIAL_VIEW);
    }

    @Test
    @DisplayName("there is no review.edit permission — staff never rewrite a guest's review")
    void reviewEditDoesNotExist() {
        assertThat(Permissions.ALL)
                .as("doc 59 §4.6: the capability does not exist, so it cannot be granted")
                .noneMatch(permission -> permission.equals("review.edit"));
    }

    @Test
    @DisplayName("default scope kinds match doc 85 §5.2")
    void defaultScopeKinds() {
        assertThat(RoleCatalogue.defaultScopeKind(UserRole.SUPER_ADMIN)).isEqualTo(ScopeKind.GLOBAL);
        assertThat(RoleCatalogue.defaultScopeKind(UserRole.ADMIN)).isEqualTo(ScopeKind.PARTNER);
        assertThat(RoleCatalogue.defaultScopeKind(UserRole.CUSTOMER)).isEqualTo(ScopeKind.OWN);
    }
}
