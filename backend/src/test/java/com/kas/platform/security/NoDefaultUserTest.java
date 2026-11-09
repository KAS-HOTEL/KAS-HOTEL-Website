package com.kas.platform.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The application ships with no account it did not intend.
 *
 * <p>Spring Boot's {@code UserDetailsServiceAutoConfiguration} creates a default
 * {@code user} and logs a generated password on every startup unless something
 * else defines a {@link UserDetailsService}. This was observed happening during
 * Phase 7.3 verification and excluded in {@code KasApplication}.
 *
 * <p>The exclusion is easy to lose: adding any security starter or a stray
 * {@code @Bean} could bring it back, and the only visible symptom is one WARN
 * line among hundreds at startup. This test is the thing that would notice.
 */
@SpringBootTest
@ActiveProfiles("test")
class NoDefaultUserTest {

    @Autowired
    private ApplicationContext context;

    @Test
    @DisplayName("no UserDetailsService is registered, so no default account exists")
    void noDefaultUserDetailsService() {
        assertThat(context.getBeanNamesForType(UserDetailsService.class))
                .as("doc 59 §8: staff accounts are created by SUPER_ADMIN only; "
                        + "an auto-configured in-memory user is an account nobody created")
                .isEmpty();
    }

    @Test
    @DisplayName("no in-memory user manager is registered either")
    void noInMemoryUserDetailsManager() {
        assertThat(context.getBeanNamesForType(
                org.springframework.security.provisioning.InMemoryUserDetailsManager.class))
                .isEmpty();
    }
}
