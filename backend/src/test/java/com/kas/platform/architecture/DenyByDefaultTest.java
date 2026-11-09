package com.kas.platform.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Doc 59 §7.1 — an endpoint with no authorisation declaration fails a CI check.
 *
 * <p>The second test is the important one. It points the same rule at fixtures
 * that are known to be non-compliant and asserts the rule catches exactly the
 * offender. Without it, a rule that silently matched nothing would pass forever
 * and this file would be a comment.
 */
class DenyByDefaultTest {

    @Test
    @DisplayName("every request-mapped method declares its authorisation")
    void productionEndpointsAllDeclareAuthorization() {
        JavaClasses production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform");

        assertThat(AuthorizationDeclarationRule.violations(production))
                .as("endpoints missing @PreAuthorize or @PublicEndpoint")
                .isEmpty();
    }

    @Test
    @DisplayName("the rule catches an undeclared endpoint — proof it is not vacuous")
    void ruleDetectsAnUndeclaredEndpoint() {
        JavaClasses fixtures = new ClassFileImporter().importPackages("com.kas.testfixtures.web");

        List<String> violations = AuthorizationDeclarationRule.violations(fixtures);

        assertThat(violations)
                .as("the undeclared fixture, and only the undeclared fixture")
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("UndeclaredController"));
    }
}
