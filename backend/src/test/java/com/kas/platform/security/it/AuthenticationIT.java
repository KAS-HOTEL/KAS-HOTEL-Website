package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Authentication — doc 59 §8, doc 06 §5.1–5.3. */
class AuthenticationIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "correct-horse-battery-staple-7431";

    @Test
    @DisplayName("valid credentials authenticate and set HttpOnly token cookies")
    void validCredentialsAuthenticate() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);

        Cookie[] cookies = login(fixtures.emailOf(userId), PASSWORD);

        Cookie access = cookieNamed(cookies, "kas_access");
        Cookie refresh = cookieNamed(cookies, "kas_refresh");

        assertThat(access).isNotNull();
        assertThat(access.isHttpOnly())
                .as("doc 59 §8: never readable by script, never localStorage")
                .isTrue();
        assertThat(refresh).isNotNull();
        assertThat(refresh.isHttpOnly()).isTrue();
        assertThat(refresh.getPath())
                .as("the long-lived credential is scoped to the auth path only")
                .isEqualTo("/api/v1/public/auth");

        assertThat(fixtures.activeSessionCount(userId))
                .as("a server-side session row is what makes revocation possible")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("the authenticated identity actually works on a protected endpoint")
    void authenticatedIdentityReachesProtectedEndpoint() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);

        mockMvc.perform(get("/api/v1/me/sessions").cookie(login(fixtures.emailOf(userId), PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].current").value(true));
    }

    @Test
    @DisplayName("a wrong password is refused")
    void wrongPasswordIsRefused() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);

        attemptLoginExpecting(fixtures.emailOf(userId), "not-the-password", 401);
        assertThat(fixtures.activeSessionCount(userId)).isZero();
    }

    @Test
    @DisplayName("a suspended account cannot authenticate")
    void suspendedAccountCannotAuthenticate() throws Exception {
        UUID userId = fixtures.createUser("suspended", PASSWORD, "SUSPENDED");
        fixtures.grantOwnScope(userId);

        attemptLoginExpecting(fixtures.emailOf(userId), PASSWORD, 401);
        assertThat(fixtures.activeSessionCount(userId)).isZero();
    }

    @Test
    @DisplayName("a disabled account cannot authenticate")
    void disabledAccountCannotAuthenticate() throws Exception {
        UUID userId = fixtures.createUser("disabled", PASSWORD, "DISABLED");
        fixtures.grantOwnScope(userId);

        attemptLoginExpecting(fixtures.emailOf(userId), PASSWORD, 401);
    }

    @Test
    @DisplayName("an unverified account cannot authenticate")
    void unverifiedAccountCannotAuthenticate() throws Exception {
        UUID userId = fixtures.createUser("unverified", PASSWORD, "UNVERIFIED");
        fixtures.grantOwnScope(userId);

        attemptLoginExpecting(fixtures.emailOf(userId), PASSWORD, 401);
    }

    @Test
    @DisplayName("failure never discloses whether an account exists")
    void failureDoesNotDiscloseAccountExistence() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);

        String realAccountWrongPassword =
                attemptLogin(fixtures.emailOf(userId), "wrong-password")
                        .getResponse().getContentAsString();
        String noSuchAccount =
                attemptLogin("absolutely-nobody-" + UUID.randomUUID() + "@test.invalid", PASSWORD)
                        .getResponse().getContentAsString();
        String suspendedAccount;
        UUID suspended = fixtures.createUser("suspended", PASSWORD, "SUSPENDED");
        fixtures.grantOwnScope(suspended);
        suspendedAccount = attemptLogin(fixtures.emailOf(suspended), PASSWORD)
                .getResponse().getContentAsString();

        // Byte-identical apart from the correlation id. Any difference here is an
        // account-enumeration oracle: an attacker could confirm which addresses
        // are KAS guests before attacking any of them.
        assertThat(stripCorrelationId(noSuchAccount))
                .isEqualTo(stripCorrelationId(realAccountWrongPassword));
        assertThat(stripCorrelationId(suspendedAccount))
                .isEqualTo(stripCorrelationId(realAccountWrongPassword));
    }

    @Test
    @DisplayName("no response ever carries the password or its hash")
    void responsesNeverCarryPasswordMaterial() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);
        String storedHash = fixtures.passwordHashOf(userId);

        MvcResult success = mockMvc.perform(post("/api/v1/public/auth/login")
                        .with(csrf())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(credentials(fixtures.emailOf(userId), PASSWORD)))
                .andExpect(status().isNoContent())
                .andReturn();

        MvcResult failure = attemptLogin(fixtures.emailOf(userId), "wrong-password");
        MvcResult sessions = mockMvc.perform(
                        get("/api/v1/me/sessions").cookie(login(fixtures.emailOf(userId), PASSWORD)))
                .andReturn();

        for (MvcResult result : new MvcResult[]{success, failure, sessions}) {
            String body = result.getResponse().getContentAsString();
            assertThat(body).doesNotContain(PASSWORD);
            assertThat(body).doesNotContain(storedHash);
            assertThat(body).doesNotContain("argon2");
            assertThat(body).doesNotContain("passwordHash");
            assertThat(body).doesNotContain("refreshTokenHash");
        }
    }

    @Test
    @DisplayName("the stored password is an Argon2id hash, never the plaintext")
    void passwordIsStoredHashed() {
        UUID userId = fixtures.createUser("customer", PASSWORD);

        String stored = fixtures.passwordHashOf(userId);

        assertThat(stored).doesNotContain(PASSWORD);
        assertThat(stored)
                .as("doc 59 §8 mandates Argon2id")
                .startsWith("{argon2}$argon2id$");
    }

    @Test
    @DisplayName("SUPER_ADMIN authenticates with valid credentials")
    void superAdminAuthenticatesWithPassword() throws Exception {
        UUID userId = fixtures.createUser("superadmin", PASSWORD);
        fixtures.grantGlobalScope(userId, com.kas.platform.identity.UserRole.SUPER_ADMIN);

        Cookie[] cookies = login(fixtures.emailOf(userId), PASSWORD);
        assertThat(cookieNamed(cookies, "kas_access")).isNotNull();
        assertThat(cookieNamed(cookies, "kas_refresh")).isNotNull();
        assertThat(fixtures.activeSessionCount(userId)).isEqualTo(1);
    }

    @Test
    @DisplayName("logout genuinely invalidates the session server-side")
    void logoutInvalidatesTheSession() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);
        Cookie[] cookies = login(fixtures.emailOf(userId), PASSWORD);

        mockMvc.perform(post("/api/v1/public/auth/logout").with(csrf()).cookie(cookies))
                .andExpect(status().isNoContent());

        assertThat(fixtures.activeSessionCount(userId)).isZero();

        // Doc 59 §8: "logout genuinely invalidates". The access token is still
        // cryptographically valid and unexpired — it is the session check that
        // refuses it. Without that check this request would still succeed.
        mockMvc.perform(get("/api/v1/me/sessions").cookie(cookies))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("refresh rotates the token and the old one cannot be replayed")
    void refreshRotatesAndBlocksReplay() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);
        Cookie[] first = login(fixtures.emailOf(userId), PASSWORD);
        Cookie originalRefresh = cookieNamed(first, "kas_refresh");

        MvcResult refreshed = mockMvc.perform(
                        post("/api/v1/public/auth/refresh").with(csrf()).cookie(first))
                .andExpect(status().isNoContent())
                .andReturn();

        Cookie rotated = cookieNamed(cookiesOf(refreshed), "kas_refresh");
        assertThat(rotated.getValue())
                .as("doc 59 §8 requires a rotating refresh token")
                .isNotEqualTo(originalRefresh.getValue());

        mockMvc.perform(post("/api/v1/public/auth/refresh").with(csrf()).cookie(originalRefresh))
                .andExpect(status().isUnauthorized());

        assertThat(fixtures.activeSessionCount(userId))
                .as("rotation updates the existing session, so the device entry survives")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("an unauthenticated caller cannot reach /me")
    void unauthenticatedCannotReachMe() throws Exception {
        mockMvc.perform(get("/api/v1/me/sessions"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    @DisplayName("an anonymous caller gets 401 even on a permitted path that needs authentication")
    void anonymousOnPermittedPathIsUnauthenticated() throws Exception {
        // /public/auth/logout is permitAll at the chain level but requires an
        // identity at the method level. "Not identified" must read as 401
        // everywhere, not 401 in one tree and 403 in another.
        mockMvc.perform(post("/api/v1/public/auth/logout").with(csrf()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    @DisplayName("a forged access token is rejected")
    void forgedTokenIsRejected() throws Exception {
        Cookie forged = new Cookie("kas_access",
                "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsInNpZCI6IjEifQ.not-a-valid-signature");

        mockMvc.perform(get("/api/v1/me/sessions").cookie(forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("CSRF is enforced on state-changing requests")
    void csrfIsEnforced() throws Exception {
        UUID userId = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(userId);

        // Same request as the passing login test, minus the CSRF token.
        mockMvc.perform(post("/api/v1/public/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(credentials(fixtures.emailOf(userId), PASSWORD)))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------- lockout — doc 154

    @Test
    @DisplayName("5 consecutive wrong passwords lock the account; then even the right one is refused")
    void fiveConsecutiveFailuresLockTheAccount() throws Exception {
        UUID userId = fixtures.createUser("lockout", PASSWORD);
        fixtures.grantOwnScope(userId);
        String email = fixtures.emailOf(userId);

        for (int attempt = 1; attempt <= 4; attempt++) {
            attemptLoginExpecting(email, "wrong-password", 401);
        }
        assertThat(fixtures.isLocked(userId)).as("4 failures do not lock").isFalse();
        assertThat(fixtures.failedLoginCount(userId)).isEqualTo(4);

        attemptLoginExpecting(email, "wrong-password", 401);
        assertThat(fixtures.isLocked(userId)).as("the 5th failure locks").isTrue();
        assertThat(fixtures.failedLoginCount(userId)).as("the count restarts").isZero();

        attemptLoginExpecting(email, PASSWORD, 401);
        assertThat(fixtures.activeSessionCount(userId)).isZero();
    }

    @Test
    @DisplayName("the lock lasts 15 minutes and attempts during it do not extend it")
    void attemptsDuringTheLockDoNotExtendIt() throws Exception {
        UUID userId = fixtures.createUser("lockout", PASSWORD);
        fixtures.grantOwnScope(userId);
        String email = fixtures.emailOf(userId);
        for (int attempt = 1; attempt <= 5; attempt++) {
            attemptLoginExpecting(email, "wrong-password", 401);
        }
        java.time.Instant lockedUntil = fixtures.lockedUntil(userId);
        assertThat(java.time.Duration.between(java.time.Instant.now(), lockedUntil))
                .isBetween(java.time.Duration.ofMinutes(14), java.time.Duration.ofMinutes(15));

        attemptLoginExpecting(email, "wrong-password", 401);
        attemptLoginExpecting(email, PASSWORD, 401);
        assertThat(fixtures.lockedUntil(userId)).isEqualTo(lockedUntil);
        assertThat(fixtures.failedLoginCount(userId)).isZero();
    }

    @Test
    @DisplayName("once the lock has expired, the right password signs in again")
    void anExpiredLockNoLongerRefuses() throws Exception {
        UUID userId = fixtures.createUser("lockout", PASSWORD);
        fixtures.grantOwnScope(userId);
        String email = fixtures.emailOf(userId);
        for (int attempt = 1; attempt <= 5; attempt++) {
            attemptLoginExpecting(email, "wrong-password", 401);
        }
        fixtures.expireLock(userId);

        assertThat(cookieNamed(login(email, PASSWORD), "kas_access")).isNotNull();
    }

    @Test
    @DisplayName("only consecutive failures count — a successful sign-in resets the count")
    void aSuccessResetsTheCount() throws Exception {
        UUID userId = fixtures.createUser("lockout", PASSWORD);
        fixtures.grantOwnScope(userId);
        String email = fixtures.emailOf(userId);

        for (int attempt = 1; attempt <= 4; attempt++) {
            attemptLoginExpecting(email, "wrong-password", 401);
        }
        login(email, PASSWORD);
        for (int attempt = 1; attempt <= 4; attempt++) {
            attemptLoginExpecting(email, "wrong-password", 401);
        }
        assertThat(fixtures.isLocked(userId)).isFalse();
        assertThat(fixtures.failedLoginCount(userId)).isEqualTo(4);
    }

    /**
     * Runs outside the test transaction on purpose: inside it, a refused login
     * that rolled back its own writes would look identical to one that kept
     * them. The user it commits is deleted afterwards.
     */
    @Test
    @org.springframework.transaction.annotation.Transactional(
            propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    @DisplayName("a refused sign-in commits its failure count rather than rolling it back")
    void theFailureCountIsCommitted() throws Exception {
        UUID userId = fixtures.createUser("lockout-commit", PASSWORD);
        try {
            fixtures.grantOwnScope(userId);
            attemptLoginExpecting(fixtures.emailOf(userId), "wrong-password", 401);
            assertThat(fixtures.failedLoginCount(userId)).isEqualTo(1);
        } finally {
            fixtures.deleteUser(userId);
        }
    }

    /**
     * Doc 59 §8 offboarding: a refresh by an account that is no longer active
     * revokes all its sessions. Runs outside the test transaction for the same
     * reason as {@link #theFailureCountIsCommitted}; the user is deleted after.
     */
    @Test
    @org.springframework.transaction.annotation.Transactional(
            propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    @DisplayName("a refused refresh of a suspended account commits the revocation of its sessions")
    void suspendedRefreshRevocationIsCommitted() throws Exception {
        UUID userId = fixtures.createUser("offboard-commit", PASSWORD);
        try {
            fixtures.grantOwnScope(userId);
            Cookie[] cookies = login(fixtures.emailOf(userId), PASSWORD);
            assertThat(fixtures.activeSessionCount(userId)).isEqualTo(1);

            fixtures.setUserStatus(userId, "SUSPENDED");
            mockMvc.perform(post("/api/v1/public/auth/refresh").with(csrf()).cookie(cookies))
                    .andExpect(status().isUnauthorized());

            assertThat(fixtures.activeSessionCount(userId))
                    .as("the revocation survives the refused request")
                    .isZero();
        } finally {
            fixtures.deleteUser(userId);
        }
    }

    private void attemptLoginExpecting(String email, String password, int expectedStatus)
            throws Exception {
        MvcResult result = attemptLogin(email, password);
        assertThat(result.getResponse().getStatus()).isEqualTo(expectedStatus);
    }

    /** The correlation id is unique per request and is the one legitimate difference. */
    private static String stripCorrelationId(String body) {
        return body.replaceAll("\"correlationId\":\"[^\"]*\"", "\"correlationId\":\"*\"");
    }
}
