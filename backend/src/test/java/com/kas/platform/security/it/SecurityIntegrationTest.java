package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Base for the Phase 7.4 security suite.
 *
 * <p>These are real end-to-end tests: a request enters the filter chain, the
 * access-token cookie is verified, the session row is checked, permissions and
 * scope are resolved from PostgreSQL, the scope predicate reaches the SQL, and
 * the response comes back. Nothing is stubbed — an assertion that a helper
 * returns true would prove nothing about the boundary.
 *
 * <p><strong>Every test runs in a transaction that is rolled back.</strong>
 * Fixtures are synthetic and {@code kas_web_dev} is left exactly as it was found.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@Import(SecurityFixtures.class)
@EnabledIf("com.kas.platform.db.LocalDatabase#isReachable")
abstract class SecurityIntegrationTest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected SecurityFixtures fixtures;

    /**
     * Makes the fixtures' row counters relative to this test.
     *
     * <p>{@code SecurityFixtures} is a singleton, so without this a baseline
     * taken in one test would still be in force in the next. See
     * {@code SecurityFixtures#resetRowBaseline} for why the counters are
     * relative at all: they answer "did this test create one?", which is not the
     * same question as "is the table empty?" once the database holds real data.
     */
    @org.junit.jupiter.api.BeforeEach
    void captureRowBaseline() {
        fixtures.resetRowBaseline();
    }

    /**
     * Logs in and returns the cookies to present on later requests.
     *
     * <p>Goes through the real endpoint rather than fabricating a token, so
     * every test that uses it also exercises password verification, session
     * creation and token issuance.
     */
    protected Cookie[] login(String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/public/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, password)))
                .andReturn();

        if (result.getResponse().getStatus() != 204) {
            throw new AssertionError("login failed with HTTP " + result.getResponse().getStatus()
                    + ": " + result.getResponse().getContentAsString());
        }
        return cookiesOf(result);
    }

    /**
     * Reads the cookies straight out of the {@code Set-Cookie} headers.
     *
     * <p>The endpoints emit cookies as headers on a {@code ResponseEntity}, which
     * is what a real container sends. Parsing the headers is what a browser does,
     * so the tests exercise the same bytes rather than an internal view of them —
     * and the attributes that matter here ({@code HttpOnly}, {@code Path}) are
     * asserted from the wire format.
     */
    protected static Cookie[] cookiesOf(MvcResult result) {
        return result.getResponse().getHeaders(org.springframework.http.HttpHeaders.SET_COOKIE)
                .stream()
                .map(SecurityIntegrationTest::parseSetCookie)
                .toArray(Cookie[]::new);
    }

    private static Cookie parseSetCookie(String header) {
        String[] parts = header.split(";");
        String[] nameValue = parts[0].split("=", 2);
        Cookie cookie = new Cookie(nameValue[0].trim(),
                nameValue.length > 1 ? nameValue[1].trim() : "");

        for (int i = 1; i < parts.length; i++) {
            String attribute = parts[i].trim();
            String lower = attribute.toLowerCase(java.util.Locale.ROOT);
            if (lower.equals("httponly")) {
                cookie.setHttpOnly(true);
            } else if (lower.equals("secure")) {
                cookie.setSecure(true);
            } else if (lower.startsWith("path=")) {
                cookie.setPath(attribute.substring("path=".length()));
            } else if (lower.startsWith("max-age=")) {
                cookie.setMaxAge(Integer.parseInt(attribute.substring("max-age=".length()).trim()));
            }
        }
        return cookie;
    }

    protected MvcResult attemptLogin(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/v1/public/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, password)))
                .andReturn();
    }

    /**
     * The named cookie, or null when it was not set or was set to an empty value.
     *
     * <p>Empty is treated as absent because that is how a cookie is cleared: the
     * logout endpoints send the same names with no value, and a test asking
     * "is there a session cookie" must not be satisfied by the one that ends it.
     */
    protected static Cookie cookieNamed(Cookie[] cookies, String name) {
        return Arrays.stream(cookies)
                .filter(cookie -> name.equals(cookie.getName()))
                .filter(cookie -> cookie.getValue() != null && !cookie.getValue().isEmpty())
                .findFirst()
                .orElse(null);
    }

    protected static String credentials(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }
}
