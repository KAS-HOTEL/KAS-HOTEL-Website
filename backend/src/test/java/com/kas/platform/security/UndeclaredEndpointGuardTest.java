package com.kas.platform.security;

import com.kas.testfixtures.web.AuthorizationFixtures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.method.HandlerMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The runtime half of deny-by-default, proven against controllers that are
 * deliberately compliant and deliberately not.
 *
 * <p>The fixtures live outside {@code com.kas.platform} so they are never
 * component-scanned — there is no way to accidentally serve an insecure route
 * just to test that insecure routes are refused.
 */
class UndeclaredEndpointGuardTest {

    /** Pointed at the fixture package so the fixtures are actually in scope. */
    private final UndeclaredEndpointGuard guard = new UndeclaredEndpointGuard("com.kas.testfixtures");

    @Test
    @DisplayName("a handler declaring @PreAuthorize is allowed through")
    void methodLevelDeclarationIsAccepted() throws Exception {
        assertThat(preHandle(AuthorizationFixtures.MethodDeclaredController.class)).isTrue();
    }

    @Test
    @DisplayName("a class-level @PreAuthorize covers its handlers")
    void classLevelDeclarationIsAccepted() throws Exception {
        assertThat(preHandle(AuthorizationFixtures.ClassDeclaredController.class)).isTrue();
    }

    @Test
    @DisplayName("an explicitly public handler is allowed through")
    void publicEndpointDeclarationIsAccepted() throws Exception {
        assertThat(preHandle(AuthorizationFixtures.PublicDeclaredController.class)).isTrue();
    }

    @Test
    @DisplayName("a handler declaring nothing is REFUSED at runtime")
    void undeclaredHandlerIsRefused() {
        // The whole point. Adding a controller must never be enough to publish it.
        assertThatThrownBy(() -> preHandle(AuthorizationFixtures.UndeclaredController.class))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("declares no authorisation contract");
    }

    @Test
    @DisplayName("the production guard covers the real API package")
    void productionGuardCoversPlatformPackage() {
        assertThat(UndeclaredEndpointGuard.DEFAULT_GUARDED_PACKAGE)
                .as("every KAS controller must fall inside the guarded prefix")
                .isEqualTo("com.kas.platform");
        assertThat(com.kas.platform.security.api.AuthController.class.getPackageName())
                .startsWith(UndeclaredEndpointGuard.DEFAULT_GUARDED_PACKAGE);
    }

    @Test
    @DisplayName("non-KAS handlers are left alone")
    void frameworkHandlersAreNotGuarded() throws Exception {
        // Actuator's own endpoints have their own authorisation rules; this guard
        // must not break them by demanding a KAS annotation they cannot carry.
        HandlerMethod actuatorish = new HandlerMethod(
                new java.util.ArrayList<String>(), java.util.ArrayList.class.getMethod("size"));

        assertThat(guard.preHandle(
                new MockHttpServletRequest(), new MockHttpServletResponse(), actuatorish)).isTrue();
    }

    @Test
    @DisplayName("a non-handler object is left alone")
    void nonHandlerIsIgnored() {
        assertThat(guard.preHandle(
                new MockHttpServletRequest(), new MockHttpServletResponse(), "static-resource"))
                .isTrue();
    }

    private boolean preHandle(Class<?> controller) throws Exception {
        HandlerMethod handler = new HandlerMethod(
                controller.getDeclaredConstructor().newInstance(),
                controller.getDeclaredMethod("handler"));
        return guard.preHandle(new MockHttpServletRequest(), new MockHttpServletResponse(), handler);
    }
}
