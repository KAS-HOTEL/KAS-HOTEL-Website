package com.kas.platform.architecture;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopedRepository;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Doc 59 §7.3 and doc 85 §5.4 — property scope is applied in the data layer, at
 * the repository boundary.
 *
 * <p>Two structural rules make that enforceable rather than customary:
 *
 * <ol>
 *   <li>every repository over partner-owned data is marked
 *       {@link ScopedRepository}, and</li>
 *   <li>every public method on such a repository takes an
 *       {@link AuthorizationScope}.</li>
 * </ol>
 *
 * <p>Together they close the failure doc 85 §10 control 5 names: authorisation
 * cannot be bypassed by changing {@code property_id}, because there is no query
 * method that can be called without a scope in the first place.
 */
final class ScopeEnforcementRule {

    /** Modules whose tables carry partner-owned data. */
    private static final List<String> PARTNER_OWNED_PACKAGES =
            List.of("com.kas.platform.partner", "com.kas.platform.property");

    private ScopeEnforcementRule() {
    }

    /**
     * Repositories over partner-owned data that forgot the marker.
     *
     * <p>A repository may opt out only by implementing
     * {@link com.kas.platform.shared.scope.PublicReadRepository}, which is a
     * declaration that its filter is publication state rather than actor scope.
     * That is a deliberate, greppable exemption — the alternative, moving such a
     * class into a package this rule does not inspect, would achieve the same
     * thing invisibly.
     */
    static List<String> unmarkedRepositories(JavaClasses classes) {
        return classes.stream()
                .filter(type -> type.isAnnotatedWith(Repository.class))
                .filter(ScopeEnforcementRule::inPartnerOwnedPackage)
                .filter(type -> !type.isAssignableTo(ScopedRepository.class))
                .filter(type -> !type.isAssignableTo(
                        com.kas.platform.shared.scope.PublicReadRepository.class))
                .map(type -> type.getName()
                        + " — must implement ScopedRepository, or PublicReadRepository with a stated reason")
                .sorted()
                .toList();
    }

    /** Query methods that can be called without a scope. */
    static List<String> unscopedMethods(JavaClasses classes) {
        return classes.stream()
                .filter(type -> type.isAssignableTo(ScopedRepository.class))
                .filter(type -> !type.isAssignableTo(
                        com.kas.platform.shared.scope.PublicReadRepository.class))
                .filter(type -> !type.isInterface())
                .flatMap(type -> type.getMethods().stream())
                .filter(method -> method.getModifiers().contains(
                        com.tngtech.archunit.core.domain.JavaModifier.PUBLIC))
                .filter(method -> !method.getName().equals("equals")
                        && !method.getName().equals("hashCode")
                        && !method.getName().equals("toString"))
                .filter(method -> !declaresScope(method))
                .map(JavaMethod::getFullName)
                .sorted()
                .toList();
    }

    private static boolean declaresScope(JavaMethod method) {
        return method.getRawParameterTypes().stream()
                .anyMatch(parameter -> parameter.isEquivalentTo(AuthorizationScope.class));
    }

    private static boolean inPartnerOwnedPackage(JavaClass type) {
        return PARTNER_OWNED_PACKAGES.stream()
                .anyMatch(pkg -> type.getPackageName().startsWith(pkg));
    }
}
