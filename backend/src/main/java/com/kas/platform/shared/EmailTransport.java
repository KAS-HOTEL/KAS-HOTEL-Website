package com.kas.platform.shared;

import java.util.Map;

/**
 * The transactional email provider behind the outbox: {@link BrevoEmailClient}, the
 * only implementation.
 */
public interface EmailTransport {

    /** What the outbox should do next. DEFER keeps the mail without spending an attempt. */
    enum Outcome { ACCEPTED, RETRY, DEFER }

    /** {@code code} is safe to store and log: it never holds a message, address or token. */
    record SendResult(Outcome outcome, String code) {
        static final SendResult ACCEPTED = new SendResult(Outcome.ACCEPTED, null);
    }

    /** Whether the provider's key and sender are set, so queued mail may be claimed. */
    boolean configured();

    SendResult sendTemplate(String templateKey, String country, String to, Map<String, Object> params, String eventKey);

    SendResult sendInline(String to, String subject, String html, String eventKey);
}
