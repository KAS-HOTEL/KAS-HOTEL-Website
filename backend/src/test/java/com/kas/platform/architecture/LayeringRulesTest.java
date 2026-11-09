package com.kas.platform.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Layering rules that Spring Modulith's module graph does not express.
 *
 * <p>Modulith checks which <em>modules</em> may see each other. These rules
 * check what the domain may see of the <em>framework</em> — the direction in
 * which a modular monolith usually rots first.
 */
class LayeringRulesTest {

    /** Domain modules: business meaning, no delivery mechanism. */
    private static final String[] DOMAIN = {
            "com.kas.platform.partner..",
            "com.kas.platform.property..",
            "com.kas.platform.identity..",
            "com.kas.platform.settings..",
            "com.kas.platform.audit.."
    };

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform");
    }

    @Test
    @DisplayName("no domain module depends on the web adapter")
    void domainDoesNotDependOnWeb() {
        ArchRule rule = noClasses().that().resideInAnyPackage(DOMAIN)
                .should().dependOnClassesThat().resideInAPackage("com.kas.platform.web..")
                .because("a domain rule must be reachable without a servlet; "
                        + "doc 58 §1 keeps the five API surfaces separate from the domain");
        rule.check(classes);
    }

    @Test
    @DisplayName("no domain module depends on the security module")
    void domainDoesNotDependOnSecurityModule() {
        ArchRule rule = noClasses().that().resideInAnyPackage(DOMAIN)
                .should().dependOnClassesThat().resideInAPackage("com.kas.platform.security..")
                .because("authorisation is applied to the domain, not from inside it; "
                        + "the scope arrives as an AuthorizationScope parameter");
        rule.check(classes);
    }

    @Test
    @DisplayName("no domain module touches the servlet API")
    void domainDoesNotTouchServletApi() {
        ArchRule rule = noClasses().that().resideInAnyPackage(DOMAIN)
                .should().dependOnClassesThat().resideInAnyPackage("jakarta.servlet..")
                .because("a domain module that reads HttpServletRequest cannot be tested "
                        + "or reused outside a request");
        rule.check(classes);
    }

    @Test
    @DisplayName("no domain module declares a Spring MVC controller")
    void domainDeclaresNoControllers() {
        ArchRule rule = noClasses().that().resideInAnyPackage(DOMAIN)
                .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web.bind.annotation..")
                .because("doc 58 §1: public and admin share no controller, and controllers "
                        + "belong to the web adapter where the denylist test can see them");
        rule.check(classes);
    }

    @Test
    @DisplayName("the web adapter does not reach into the security module")
    void webDoesNotDependOnSecurityModule() {
        ArchRule rule = noClasses().that().resideInAPackage("com.kas.platform.web..")
                .should().dependOnClassesThat().resideInAPackage("com.kas.platform.security..")
                .because("security depends on web for the error contract; the reverse "
                        + "would make the dependency cyclic");
        rule.check(classes);
    }

    @Test
    @DisplayName("persistence is Spring JDBC — no JPA or Hibernate anywhere")
    void noJpaOrHibernate() {
        ArchRule rule = noClasses().that().resideInAPackage("com.kas.platform..")
                .should().dependOnClassesThat().resideInAnyPackage("jakarta.persistence..", "org.hibernate..")
                .because("the Phase 7.2 schema is frozen and validated; an ORM with schema "
                        + "management is a standing risk to it (doc 89 §4.2)");
        rule.check(classes);
    }
}
