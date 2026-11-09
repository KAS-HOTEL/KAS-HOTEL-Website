package com.kas.platform.contract;

import com.kas.platform.security.PublicEndpoint;
import com.kas.testfixtures.publicapi.DenylistFixtures;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Doc 58 §9 layer 4 — the blocking denylist contract test.
 *
 * <p>Two scans run. The package scan covers the declared response packages and
 * the named stragglers; the @PublicEndpoint scan covers whatever an
 * unauthenticated handler actually returns, whichever package it lives in. The
 * tests after them are what make either meaningful, by proving the scanner
 * catches a leak at the top level, at depth, inside a collection, and through
 * the one documented name exception.
 */
class PublicResponseDenylistTest {

    /**
     * Every package that can put a type on the wire to a customer-facing or
     * authenticated caller. Adding an API package without adding it here would
     * leave it unscanned. The stronger guard is
     * {@link #everyPublicEndpointReturnTypeIsClean()}, which follows the
     * @PublicEndpoint annotation rather than a package name.
     */
    static final List<String> RESPONSE_PACKAGES = List.of(
            "com.kas.platform.web.publicapi",
            "com.kas.platform.security.api",
            "com.kas.platform.onboarding.api",
            "com.kas.platform.media.api");

    /**
     * Public response types that live outside an {@code api} package.
     *
     * <p>{@code PublishedProperty}, {@code PublishedRoomType} and
     * {@code PublicPolicyView} sit in the {@code property} module beside the
     * domain records they are mapped from, so the package scan above cannot
     * include them without also dragging in {@code Property} and
     * {@code PropertyPolicy} — domain types that legitimately carry
     * {@code partnerId} and internal state. They are named individually instead,
     * because being unscanned is not an option: all three are returned straight
     * to guests.
     */
    static final List<Class<?>> ADDITIONAL_RESPONSE_TYPES = List.of(
            com.kas.platform.property.PublishedProperty.class,
            com.kas.platform.property.PublishedRoomType.class,
            com.kas.platform.property.PublicPolicyView.class);

    @Test
    @DisplayName("no public response type exposes a denylisted field, at any depth")
    void publicResponseTypesAreClean() {
        List<JavaClass> publicTypes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages(RESPONSE_PACKAGES.toArray(String[]::new))
                .stream()
                .filter(type -> !type.getSimpleName().isEmpty())
                // Controllers are scanned for their own fields (injected
                // collaborators), which is noise; the response types are what
                // travel. Request types are covered too: a password field on one
                // would be caught, which is why LoginRequest has no getter-shaped
                // exposure and a redacted toString.
                .filter(type -> !type.getSimpleName().endsWith("Controller"))
                .toList();

        for (JavaClass javaClass : publicTypes) {
            Class<?> type = javaClass.reflect();
            assertThat(PublicResponseDenylist.violations(type))
                    .as("denylisted fields reachable from %s", type.getName())
                    .isEmpty();
        }

        for (Class<?> type : ADDITIONAL_RESPONSE_TYPES) {
            assertThat(PublicResponseDenylist.violations(type))
                    .as("denylisted fields reachable from %s", type.getName())
                    .isEmpty();
        }
    }

    /**
     * The real invariant, bound to what actually makes a response public.
     *
     * <p>Phase 7.5C shipped a public response type that no scan reached, because
     * the denylist listed packages by hand and a new one was added without it.
     * The first fix asserted that every {@code ..api} package appeared in
     * {@link #RESPONSE_PACKAGES} — which held only while every API package was
     * wholly public.
     *
     * <p>Phase 7.5E broke that premise. {@code inventory.api} contains both
     * {@link com.kas.platform.inventory.api.RoomTypeAvailabilityView} (guest) and
     * {@link com.kas.platform.inventory.api.InventoryDayView} (operator), and the
     * operator view carries {@code total}, {@code maintenance},
     * {@code directCommitted} and {@code bufferTarget} <em>by design</em> — doc
     * 04 §4.3 requires the calendar to show them. Doc 58 §9 governs "Public and
     * {@code /me}", not the operations console, so scanning that package wholesale
     * would have been a false positive, and adding an exemption list for it would
     * have been an invitation.
     *
     * <p>So the guard now scans <strong>what every {@code @PublicEndpoint} handler
     * actually returns</strong>. That is the property doc 58 §9 is really about,
     * it needs no naming convention to stay true, and it cannot be satisfied by
     * moving a class to a different package.
     */
    @Test
    @DisplayName("every @PublicEndpoint return type is denylist-clean")
    void everyPublicEndpointReturnTypeIsClean() {
        List<Class<?>> returned = publicEndpointReturnTypes();

        assertThat(returned)
                .as("no @PublicEndpoint handler was found — the scanner is broken, not the code")
                .isNotEmpty();

        for (Class<?> type : returned) {
            assertThat(PublicResponseDenylist.violations(type))
                    .as("denylisted fields reachable from %s, returned by a public endpoint",
                            type.getName())
                    .isEmpty();
        }
    }

    /**
     * Return types of every {@code @PublicEndpoint} handler, with collection and
     * {@code ResponseEntity} wrappers unwrapped to their element type.
     */
    private static List<Class<?>> publicEndpointReturnTypes() {
        List<Class<?>> types = new ArrayList<>();

        for (JavaClass javaClass : new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform")) {

            if (javaClass.getSimpleName().isEmpty()) {
                continue;
            }
            for (Method method : javaClass.reflect().getDeclaredMethods()) {
                if (method.isAnnotationPresent(PublicEndpoint.class)) {
                    types.addAll(payloadTypes(method.getGenericReturnType()));
                }
            }
        }
        return types;
    }

    /** A {@code List<Foo>} carries {@code Foo} on the wire, so follow the argument. */
    private static List<Class<?>> payloadTypes(Type returnType) {
        if (returnType instanceof ParameterizedType parameterized) {
            List<Class<?>> arguments = new ArrayList<>();
            for (Type argument : parameterized.getActualTypeArguments()) {
                arguments.addAll(payloadTypes(argument));
            }
            return arguments;
        }
        if (returnType instanceof Class<?> raw && raw.getName().startsWith("com.kas.")) {
            return List.of(raw);
        }
        return List.of();
    }

    @Test
    @DisplayName("the contract's own legitimate shapes are not flagged")
    void legitimateShapesPass() {
        assertThat(PublicResponseDenylist.violations(DenylistFixtures.RoomTypeAvailabilityView.class))
                .as("doc 58 §3.2 availability response")
                .isEmpty();

        assertThat(PublicResponseDenylist.violations(DenylistFixtures.StayDetailView.class))
                .as("doc 58 §4 stay detail — `total` as Money is required by the contract")
                .isEmpty();
    }

    @Test
    @DisplayName("a top-level denylisted field is caught")
    void topLevelLeakIsCaught() {
        assertThat(PublicResponseDenylist.violations(DenylistFixtures.PartnerLeakView.class))
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("partnerId"));
    }

    @Test
    @DisplayName("a denylisted field nested two levels deep is caught")
    void nestedLeakIsCaught() {
        assertThat(PublicResponseDenylist.violations(DenylistFixtures.NestedLeakView.class))
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("salesStatus"));
    }

    @Test
    @DisplayName("a denylisted field inside a collection's element type is caught")
    void collectionElementLeakIsCaught() {
        assertThat(PublicResponseDenylist.violations(DenylistFixtures.CollectionLeakView.class))
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("salesStatus"));
    }

    @Test
    @DisplayName("the Money exception for `total` cannot smuggle an inventory count")
    void inventoryTotalIsStillCaught() {
        assertThat(PublicResponseDenylist.violations(DenylistFixtures.InventoryTotalLeakView.class))
                .as("`total` as an int is the inventory figure, and stays denylisted")
                .hasSize(1)
                .allSatisfy(v -> assertThat(v).contains("total"));
    }
}
