package com.kas.platform.shared;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** States at startup whether this process can deliver email. Presence only, never a value. */
@Component
class EmailDeliveryStartupReport {
    private static final Logger log = LoggerFactory.getLogger(EmailDeliveryStartupReport.class);
    private final Environment config;

    EmailDeliveryStartupReport(Environment config) {
        this.config = config;
    }

    @EventListener(ApplicationReadyEvent.class)
    void report() {
        log.info("Email delivery: dispatcher={} provider=brevo key={} sender={} outboxKey={} recipients={} operationsEmail={} templateIdsMissing={}",
                config.getProperty("kas.email.outbox.enabled", Boolean.class, true) ? "on" : "off",
                status("kas.brevo.api-key"), status("kas.brevo.sender-email"),
                present("kas.email.outbox.encryption-key") ? "dedicated" : "derived",
                recipients(), status("kas.booking.operations-email"), missingTemplateIds());
    }

    /**
     * Templates with no Brevo id for one or both languages. Those are sent from the
     * local design in resources/email-templates; the list is names only, never values.
     */
    private String missingTemplateIds() {
        java.util.List<String> missing = new java.util.ArrayList<>();
        for (String key : EmailTemplates.KEYS) {
            for (String language : new String[]{"VI", "EN"}) {
                String name = "BREVO_TEMPLATE_" + key + "_" + language;
                if (!present(name)) missing.add(key + "_" + language);
            }
        }
        return missing.isEmpty() ? "none" : String.join(",", missing);
    }

    private String recipients() {
        if (present("kas.email.allowed-recipients")) return "allowlist";
        return config.getProperty("kas.email.require-allowlist", Boolean.class, false) ? "all-held" : "all";
    }

    private String status(String key) {
        return present(key) ? "present" : "missing";
    }

    private boolean present(String key) {
        return !config.getProperty(key, "").isBlank();
    }
}
