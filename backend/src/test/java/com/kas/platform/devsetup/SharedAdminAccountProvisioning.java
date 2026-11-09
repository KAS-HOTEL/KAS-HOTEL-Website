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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Creates the one shared KAS staff account, or changes its password — doc 154.
 *
 * <h2>What it creates</h2>
 *
 * <p>One {@code app_user} holding <strong>SUPER_ADMIN over GLOBAL scope</strong>,
 * which every KAS staff member shares. It signs in with email and password at
 * {@code /admin/login} or {@code /partner/login}; one session serves both
 * consoles. Running the tool again with the same email re-hashes the password,
 * clears any lock and revokes every open session, so a changed password takes
 * effect everywhere at once.
 *
 * <h2>Two independent locks</h2>
 *
 * <p>As with {@link DevPartnerAccountProvisioning}, the file name matches neither
 * the Surefire nor the Failsafe include pattern, so a normal {@code mvn test} or
 * {@code mvn verify} never runs it, and it refuses to run unless
 * {@code KAS_ADMIN_PASSWORD} is set. {@code KAS_ADMIN_EMAIL} is required too.
 *
 * <pre>
 * KAS_ADMIN_EMAIL='…' KAS_ADMIN_PASSWORD='…' ./mvnw test \
 *     -Dtest=SharedAdminAccountProvisioning -DfailIfNoSpecifiedTests=false
 * </pre>
 *
 * <p>The password is read from the environment and never written to a file, a
 * log or this source. Only an Argon2id hash is stored, produced by the
 * application's own {@link PasswordEncoder} bean. Because one password opens the
 * whole platform, it must be at least 16 characters.
 *
 * <p>The account is for the development database, so the datasource URL is
 * pinned to {@code kas_web_dev}, not the integration-test database.
 */
@SpringBootTest
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named = "KAS_ADMIN_PASSWORD", matches = ".+")
class SharedAdminAccountProvisioning {

    static final int MINIMUM_PASSWORD_LENGTH = 16;

    /** kas_web_dev unless KAS_ADMIN_DATABASE names the test database. No other target exists. */
    private static String targetDatabase() {
        String named = System.getenv("KAS_ADMIN_DATABASE");
        return "kas_web_test".equals(named) ? "kas_web_test" : "kas_web_dev";
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",
                () -> "jdbc:postgresql://127.0.0.1:5433/" + targetDatabase() + "?currentSchema=kas");
    }

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    @DisplayName("creates a staff account, or changes its password")
    void provision() {
        String email = System.getenv("KAS_ADMIN_EMAIL");
        String password = System.getenv("KAS_ADMIN_PASSWORD");
        assertThat(email).as("KAS_ADMIN_EMAIL").isNotBlank().contains("@");
        assertThat(password).as("KAS_ADMIN_PASSWORD length").hasSizeGreaterThanOrEqualTo(MINIMUM_PASSWORD_LENGTH);

        assertThat(jdbc.sql("SELECT current_database()").query(String.class).single())
                .as("target database").isEqualTo(targetDatabase());
        boolean superAdmin = !"ADMIN".equals(System.getenv("KAS_ADMIN_ROLE"));
        UserRole role = superAdmin ? UserRole.SUPER_ADMIN : UserRole.ADMIN;

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
                .param("email", email.trim())
                .param("hash", passwordEncoder.encode(password))
                .query(UUID.class)
                .single();

        // One live grant, not one per run: SUPER_ADMIN over GLOBAL, ADMIN over the
        // one partner that owns the KAS hotels.
        int live = jdbc.sql("""
                        SELECT count(*) FROM role_assignment
                         WHERE user_id = :userId AND revoked_at IS NULL
                           AND role = CAST(:role AS user_role)
                        """)
                .param("userId", userId)
                .param("role", role.name())
                .query(Integer.class)
                .single();
        if (live == 0 && superAdmin) {
            jdbc.sql("""
                            INSERT INTO role_assignment (user_id, role, scope_kind)
                            VALUES (:userId, CAST(:role AS user_role), CAST('GLOBAL' AS scope_kind))
                            """)
                    .param("userId", userId)
                    .param("role", role.name())
                    .update();
        } else if (live == 0) {
            UUID partner = jdbc.sql("SELECT DISTINCT partner_id FROM property WHERE slug LIKE 'kas-%'")
                    .query(UUID.class).single();
            jdbc.sql("""
                            INSERT INTO role_assignment (user_id, role, scope_kind, partner_id)
                            VALUES (:userId, CAST(:role AS user_role), CAST('PARTNER' AS scope_kind), :partner)
                            """)
                    .param("userId", userId)
                    .param("role", role.name())
                    .param("partner", partner)
                    .update();
        }

        // A changed password must end every session opened with the old one.
        int revoked = jdbc.sql("UPDATE user_session SET revoked_at = now() "
                        + "WHERE user_id = :userId AND revoked_at IS NULL")
                .param("userId", userId)
                .update();

        // Identifiers only. The password is never echoed and the hash never read back.
        System.out.println("[shared-admin] email=" + email.trim() + " userId=" + userId
                + " role=" + role + " database=" + targetDatabase() + " sessionsRevoked=" + revoked);
    }
}
