package com.kas.platform.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The prohibited-concept guard, in both directions: production code is clean,
 * and the rule provably catches each prohibited shape.
 */
class ForbiddenConceptsTest {

    private static JavaClasses production;
    private static JavaClasses fixtures;

    @BeforeAll
    static void importClasses() {
        production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform");
        fixtures = new ClassFileImporter().importPackages("com.kas.testfixtures.domain");
    }

    @Test
    @DisplayName("no prohibited entity exists — PhysicalRoom, split reservations, Cart, RatePlan")
    void noProhibitedEntities() {
        assertThat(ForbiddenConceptsRule.prohibitedTypes(production)).isEmpty();
    }

    @Test
    @DisplayName("no field can hold a physical room identity")
    void noPhysicalRoomFields() {
        assertThat(ForbiddenConceptsRule.physicalRoomFields(production)).isEmpty();
    }

    @Test
    @DisplayName("no generic status or source on a reservation type")
    void noCollapsedLifecycleFields() {
        assertThat(ForbiddenConceptsRule.collapsedLifecycleFields(production)).isEmpty();
    }

    @Test
    @DisplayName("the rules catch each prohibited shape — proof they are not vacuous")
    void rulesDetectProhibitedShapes() {
        assertThat(ForbiddenConceptsRule.prohibitedTypes(fixtures))
                .as("PhysicalRoom")
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("PhysicalRoom"));

        assertThat(ForbiddenConceptsRule.physicalRoomFields(fixtures))
                .as("roomNumber and floor")
                .hasSize(2);

        assertThat(ForbiddenConceptsRule.collapsedLifecycleFields(fixtures))
                .as("generic status and generic source, but not salesStatus/stayStatus")
                .hasSize(2)
                .noneSatisfy(v -> assertThat(v).contains("CompliantReservation"));
    }
}
