package com.kas.platform.shared;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

/**
 * The one clock, fixed to the property timezone.
 *
 * <p>Doc 55 §2, <strong>CONFIRMED</strong>:
 *
 * <blockquote>All inventory dates are <strong>property-local calendar dates</strong>
 * in {@code Asia/Ho_Chi_Minh}. Timestamps are UTC; inventory dates are
 * {@code date}, never {@code timestamptz}. Conflating them produces
 * midnight-boundary defects.</blockquote>
 *
 * <p>Doc 15 §12 adds the operational reason: "Clock skew across servers — single
 * time source; dates computed in the property timezone."
 *
 * <p>So this is not a chosen default. It is a transcribed rule, and it is the
 * reason "today" is asked of an injected {@link Clock} rather than of
 * {@code LocalDate.now()}: a server in another region would otherwise open and
 * close a booking day at the wrong hour.
 *
 * <p>Instants are unaffected — a {@code Clock}'s zone changes what calendar date
 * it reports, never what moment it reports, so UTC timestamps stay UTC.
 */
@Configuration
public class TimeConfiguration {

    /** The eight properties are all in Ho Chi Minh City (doc 03 §1). */
    public static final ZoneId PROPERTY_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Bean
    public Clock clock() {
        return Clock.system(PROPERTY_ZONE);
    }
}
