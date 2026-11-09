package com.kas.platform.devsetup;

import com.kas.platform.identity.UserRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Provisions the single local development Partner account (OQ-134).
 *
 * <p><strong>Superseded by {@link SharedAdminAccountProvisioning} (doc 154).</strong>
 * KAS staff now share one SUPER_ADMIN account; this partner-scoped ADMIN account
 * is no longer part of the operating model. Kept for reference.
 *
 * <h2>Why this lives in test scope</h2>
 *
 * <p>Nothing that can create an administrative account belongs in the production
 * artefact. Test sources are never packaged, so this class cannot ship, cannot be
 * reached by a running server, and cannot be triggered by a request.
 *
 * <p>It is deliberately <strong>not</strong> a Flyway migration. A migration
 * would push one developer's login into every environment that ever runs the
 * schema, which is how a shared credential ends up in production.
 *
 * <h2>Two independent locks</h2>
 *
 * <p>The file name matches neither the Surefire nor the Failsafe include pattern,
 * so a normal {@code mvn test} or {@code mvn verify} never runs it. It also
 * refuses to run unless {@code KAS_DEV_PARTNER_PASSWORD} is set in the
 * environment. Both must be true at once:
 *
 * <pre>
 * KAS_DEV_PARTNER_PASSWORD='…' ./mvnw test \
 *     -Dtest=DevPartnerAccountProvisioning -DfailIfNoSpecifiedTests=false
 * </pre>
 *
 * <p>The password is read from the environment and never written to a file, a
 * log or this source. The row it produces stores only an Argon2id hash, produced
 * by the application's own {@link PasswordEncoder} bean, so this provisioning
 * path cannot drift from the one {@code AuthenticationService} verifies against.
 *
 * <h2>What it creates</h2>
 *
 * <p>Exactly one {@code app_user} plus one {@code role_assignment}:
 * <strong>role ADMIN, scope PARTNER</strong>, over the partner that already
 * exists in the database. Not SUPER_ADMIN — that role requires a second factor
 * which is not implemented, and creating one would mean either weakening
 * authentication or shipping an account nobody can use.
 *
 * <p>Idempotent: running it again re-hashes the same email rather than creating a
 * second account. To remove it:
 *
 * <pre>DELETE FROM kas.app_user WHERE email = 'partner.dev@kas.invalid';</pre>
 *
 * <p>{@code role_assignment} and {@code user_session} both cascade on delete, so
 * that one statement removes the account and every session it opened.
 *
 * <h2>Target database</h2>
 *
 * <p>The account is for the development database, so the datasource URL is
 * pinned to {@code kas_web_dev}. The test profile itself points at the separate
 * integration-test database {@code kas_web_test}, which must never receive it.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties =
        "spring.datasource.url=jdbc:postgresql://127.0.0.1:5433/kas_web_dev?currentSchema=kas")
@EnabledIfEnvironmentVariable(named = "KAS_DEV_PARTNER_PASSWORD", matches = ".+")
class DevPartnerAccountProvisioning {

    /**
     * `.invalid` is reserved by RFC 2606 and can never resolve, so this address
     * cannot collide with a real mailbox or receive mail by accident.
     */
    private static final String DEFAULT_EMAIL = "partner.dev@kas.invalid";

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    @DisplayName("provisions one ADMIN account with PARTNER scope over the existing partner")
    void provision() {
        String email = System.getenv().getOrDefault("KAS_DEV_PARTNER_EMAIL", DEFAULT_EMAIL);
        String password = System.getenv("KAS_DEV_PARTNER_PASSWORD");
        assertThat(password).as("KAS_DEV_PARTNER_PASSWORD").isNotBlank();

        // The partner is looked up, never named. If a second one is ever added,
        // this stops rather than guessing which estate the account should reach.
        List<UUID> partners = jdbc.sql("SELECT id FROM partner ORDER BY created_at")
                .query(UUID.class)
                .list();
        assertThat(partners)
                .as("exactly one partner must exist for unambiguous scope assignment")
                .hasSize(1);
        UUID partnerId = partners.getFirst();

        UUID userId = jdbc.sql("""
                        INSERT INTO app_user
                            (email, password_hash, status, two_factor_enabled, locale,
                             failed_login_count, email_verified_at)
                        VALUES (:email, :hash, CAST('ACTIVE' AS user_status), false, 'vi', 0, now())
                        ON CONFLICT (email) DO UPDATE
                           SET password_hash = EXCLUDED.password_hash,
                               status = CAST('ACTIVE' AS user_status),
                               failed_login_count = 0,
                               locked_until = NULL,
                               updated_at = now()
                        RETURNING id
                        """)
                .param("email", email)
                .param("hash", passwordEncoder.encode(password))
                .query(UUID.class)
                .single();

        // One live assignment, not one per run. Doc 85 §2.2: a PARTNER-scoped
        // grant reaches every property the partner owns, including ones created
        // later, so there is nothing to re-grant when the estate grows.
        int live = jdbc.sql("""
                        SELECT count(*) FROM role_assignment
                         WHERE user_id = :userId AND revoked_at IS NULL
                           AND role = CAST(:role AS user_role)
                           AND scope_kind = CAST('PARTNER' AS scope_kind)
                           AND partner_id = :partnerId
                        """)
                .param("userId", userId)
                .param("role", UserRole.ADMIN.name())
                .param("partnerId", partnerId)
                .query(Integer.class)
                .single();

        if (live == 0) {
            jdbc.sql("""
                            INSERT INTO role_assignment (user_id, role, scope_kind, partner_id)
                            VALUES (:userId, CAST(:role AS user_role),
                                    CAST('PARTNER' AS scope_kind), :partnerId)
                            """)
                    .param("userId", userId)
                    .param("role", UserRole.ADMIN.name())
                    .param("partnerId", partnerId)
                    .update();
        }

        // Identifiers only. The password is never echoed, and the hash is never
        // read back — there is nothing here for a terminal scrollback to leak.
        System.out.println("[dev-account] email=" + email + " userId=" + userId
                + " role=ADMIN scope=PARTNER partnerId=" + partnerId);

        assertThat(jdbc.sql("SELECT count(*) FROM role_assignment "
                        + "WHERE user_id = :id AND revoked_at IS NULL")
                .param("id", userId)
                .query(Integer.class)
                .single())
                .as("exactly one live assignment")
                .isEqualTo(1);
    }
}
