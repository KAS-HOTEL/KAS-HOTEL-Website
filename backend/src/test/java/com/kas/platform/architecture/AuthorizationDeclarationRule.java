package com.kas.platform.architecture;

import com.kas.platform.security.PublicEndpoint;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;

/**
 * The deny-by-default CI check required by doc 59 §7.1:
 *
 * <blockquote>Every endpoint declares its required permission explicitly. An
 * endpoint with no declaration <strong>fails closed and fails a CI check</strong>.</blockquote>
 *
 * <p>Written as a reusable function rather than inline in one test, so the same
 * logic can be pointed at production code (which must have no violations) and at
 * deliberately non-compliant fixtures (which must be caught). A rule that has
 * only ever been run against compliant code has not been shown to work.
 */
final class AuthorizationDeclarationRule {

    private AuthorizationDeclarationRule() {
    }

    /**
     * Request-mapped methods that declare neither a required permission nor an
     * explicit public exemption.
     *
     * @return the offending method names; empty means compliant
     */
    static List<String> violations(JavaClasses classes) {
        return classes.stream()
                .filter(type -> type.isMetaAnnotatedWith(Controller.class))
                .flatMap(type -> type.getMethods().stream())
                .filter(method -> method.isMetaAnnotatedWith(RequestMapping.class))
                .filter(method -> !declaresAuthorization(method))
                .map(JavaMethod::getFullName)
                .sorted()
                .toList();
    }

    /**
     * A class-level declaration covers its methods: it is a legitimate way to
     * state "this whole controller requires this permission", which several of
     * the doc 58 admin route trees will use.
     */
    private static boolean declaresAuthorization(JavaMethod method) {
        return method.isAnnotatedWith(PreAuthorize.class)
                || method.isAnnotatedWith(PublicEndpoint.class)
                || method.getOwner().isAnnotatedWith(PreAuthorize.class)
                || method.getOwner().isAnnotatedWith(PublicEndpoint.class);
    }
}
