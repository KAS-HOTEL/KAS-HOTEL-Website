package com.kas.platform.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Partner and property isolation, enforced structurally.
 *
 * <p>The full behavioural test — seed two partners, authenticate as Partner A's
 * admin, assert 404 for every one of Partner B's records (doc 85 §6.3) —
 * needs a database and arrives with the admin endpoints it exercises. What is
 * verifiable now, and worth verifying now, is that no query <em>can</em> be
 * written without a scope. That is the property the behavioural test would be
 * checking the consequences of.
 */
class ScopeEnforcementStructureTest {

    private static JavaClasses production;
    private static JavaClasses fixtures;

    @BeforeAll
    static void importClasses() {
        production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform");
        fixtures = new ClassFileImporter().importPackages("com.kas.testfixtures.repository");
    }

    @Test
    @DisplayName("every repository over partner-owned data is marked ScopedRepository")
    void partnerOwnedRepositoriesAreMarked() {
        assertThat(ScopeEnforcementRule.unmarkedRepositories(production)).isEmpty();
    }

    @Test
    @DisplayName("no scoped repository exposes a query that omits the scope")
    void everyScopedQueryTakesAScope() {
        assertThat(ScopeEnforcementRule.unscopedMethods(production))
                .as("repository methods callable without an AuthorizationScope")
                .isEmpty();
    }

    @Test
    @DisplayName("the rule catches an unscoped query — proof it is not vacuous")
    void ruleDetectsAnUnscopedQuery() {
        assertThat(ScopeEnforcementRule.unscopedMethods(fixtures))
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("findEverything"));
    }
}
