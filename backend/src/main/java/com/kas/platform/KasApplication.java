package com.kas.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

/**
 * KAS Hotel Platform — modular monolith entry point.
 *
 * <p>Every direct sub-package of {@code com.kas.platform} is a Spring Modulith
 * application module. Allowed dependencies are declared on each module's
 * {@code package-info.java} and verified by {@code ModuleStructureTest}.
 *
 * <p>Phase 7.3 establishes the foundation only. Business modules (inventory,
 * pricing, sales, reservation, customer, review, media, notification, payment)
 * are deliberately absent rather than created empty.
 */
/**
 * Scheduling is enabled for one job: the S13 hold-expiry sweep (doc 55 §5.1).
 * Its cadence and its off-switch live on {@code HoldExpiryScheduler}.
 */
@EnableScheduling
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@org.springframework.boot.context.properties.ConfigurationPropertiesScan
public class KasApplication {

    /*
     * UserDetailsServiceAutoConfiguration is excluded deliberately.
     *
     * Left enabled, Spring Boot creates a default in-memory user named `user`
     * and prints its generated password to the log at every startup. Two things
     * are wrong with that here:
     *
     *   1. A credential in the log. Doc 58 §10 and the Phase 7.3 brief both
     *      forbid it, and it would be printed on every production start.
     *   2. An account nobody created. Doc 59 §8: "Staff accounts are created by
     *      SUPER_ADMIN only. No self-registration." A deny-by-default system
     *      that ships with an account it did not intend has a hole in it,
     *      whether or not that account can currently reach anything.
     *
     * KAS authenticates against `app_user` through IdentityRepository. When the
     * auth endpoints of doc 58 §3.4 ship, they bring their own
     * AuthenticationProvider — not this one.
     *
     * Asserted by NoDefaultUserTest.
     */

    public static void main(String[] args) {
        SpringApplication.run(KasApplication.class, args);
    }
}
