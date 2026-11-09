package com.kas.platform.security;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * Readiness: can this instance actually authenticate anyone?
 *
 * <p>Without a signing secret or a configured lifetime, the application starts
 * and serves public content perfectly well but every login fails. That is the
 * worst kind of partial failure — healthy-looking and completely broken for
 * users — so it belongs in <em>readiness</em>, where an orchestrator will stop
 * routing traffic to the instance, rather than in a log line nobody reads.
 *
 * <p>The detail names the missing <strong>property</strong> and never its value.
 * A readiness endpoint that echoed a signing secret would be worse than the
 * misconfiguration it reports.
 */
@Component("kasAuthentication")
public class AuthConfigurationHealthIndicator implements HealthIndicator {

    private final AuthenticationProperties properties;

    public AuthConfigurationHealthIndicator(AuthenticationProperties properties) {
        this.properties = properties;
    }

    @Override
    public Health health() {
        String missing = properties.firstMissingProperty();
        if (missing != null) {
            return Health.down()
                    .withDetail("reason", "authentication is not configured")
                    .withDetail("missingProperty", missing)
                    .build();
        }
        return Health.up()
                .withDetail("accessTokenTtl", properties.accessTokenTtl().toString())
                .withDetail("staffRefreshTtl", properties.staffRefreshTtl().toString())
                .withDetail("customerRefreshTtl", properties.customerRefreshTtl().toString())
                .withDetail("secureCookies", properties.secureCookies())
                .build();
    }
}
