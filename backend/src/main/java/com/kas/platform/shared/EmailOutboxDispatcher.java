package com.kas.platform.shared;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** Sends committed mail commands with bounded exponential retries. */
@Component
@ConditionalOnProperty(name = "kas.email.outbox.enabled", havingValue = "true", matchIfMissing = true)
public class EmailOutboxDispatcher {
    private static final Logger log = LoggerFactory.getLogger(EmailOutboxDispatcher.class);
    /** How long a fix can take: the mail waits, it does not spend its attempts. */
    private static final Duration DEFER_DELAY = Duration.ofMinutes(15);
    /** The verification code and the reset link both expire 30 minutes after they are issued. */
    private static final Duration SHORT_LIVED_CONTENT = Duration.ofMinutes(30);
    private static final List<String> SHORT_LIVED_EVENTS =
            List.of("member-email-verification-", "customer-password-reset-");
    private final EmailOutboxRepository outbox;
    private final EmailOutboxCipher cipher;
    private final EmailTransport transport;
    private final ObjectMapper json;
    private final int maxAttempts;
    private final int batchSize;
    private final AtomicBoolean pausedLogged = new AtomicBoolean();

    public EmailOutboxDispatcher(EmailOutboxRepository outbox, EmailOutboxCipher cipher,
            EmailTransport transport, ObjectMapper json,
            @Value("${kas.email.outbox.max-attempts:8}") int maxAttempts,
            @Value("${kas.email.outbox.batch-size:20}") int batchSize) {
        this.outbox = outbox;
        this.cipher = cipher;
        this.transport = transport;
        this.json = json;
        this.maxAttempts = maxAttempts;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${kas.email.outbox.poll-interval:PT5S}")
    public void dispatchDue() {
        // Claiming here would spend attempts on mail that cannot leave, and the
        // last attempt erases the payload. Queued mail waits for the configuration.
        if (!transport.configured()) {
            if (pausedLogged.compareAndSet(false, true)) {
                log.warn("Email dispatch paused: the email provider key or sender is missing; queued mail stays queued");
            }
            return;
        }
        pausedLogged.set(false);
        for (var item : outbox.claim(batchSize, maxAttempts)) {
            deliver(item);
        }
    }

    private void deliver(EmailOutboxRepository.ClaimedEmail item) {
        if (contentExpired(item)) {
            outbox.markFailed(item.id(), maxAttempts, maxAttempts, OffsetDateTime.now(), "CONTENT_EXPIRED");
            log.warn("Email outbox skipped expired content id={}", item.id());
            return;
        }
        EmailTransport.SendResult result;
        try {
            result = send(item);
        } catch (IllegalStateException ex) {
            // A wrong key is an environment fault, and the payload is still recoverable.
            result = new EmailTransport.SendResult(EmailTransport.Outcome.DEFER, "PAYLOAD_DECRYPTION_FAILED");
        } catch (Exception ex) {
            result = new EmailTransport.SendResult(EmailTransport.Outcome.RETRY, "DELIVERY_ERROR");
        }

        switch (result.outcome()) {
            case ACCEPTED -> outbox.markSent(item.id());
            case DEFER -> {
                outbox.defer(item.id(), OffsetDateTime.now().plus(DEFER_DELAY), result.code());
                log.warn("Email outbox delivery held id={} code={}", item.id(), result.code());
            }
            case RETRY -> {
                long delaySeconds = Math.min(3600, 30L << Math.min(10, Math.max(0, item.attempts() - 1)));
                outbox.markFailed(item.id(), item.attempts(), maxAttempts,
                        OffsetDateTime.now().plusSeconds(delaySeconds), result.code());
                log.warn("Email outbox delivery deferred id={} attempt={} code={}", item.id(), item.attempts(), result.code());
            }
        }
    }

    private EmailTransport.SendResult send(EmailOutboxRepository.ClaimedEmail item) throws Exception {
        JsonNode payload = json.readTree(cipher.decrypt(item.nonce(), item.ciphertext()));
        if ("TEMPLATE".equals(payload.path("kind").asText())) {
            Map<String, Object> params = json.convertValue(payload.path("params"),
                    json.getTypeFactory().constructMapType(Map.class, String.class, Object.class));
            return transport.sendTemplate(payload.path("templateKey").asText(),
                    textOrNull(payload, "country"), textOrNull(payload, "recipient"), params, item.eventKey());
        }
        return transport.sendInline(textOrNull(payload, "recipient"),
                payload.path("subject").asText(), payload.path("html").asText(), item.eventKey());
    }

    private static boolean contentExpired(EmailOutboxRepository.ClaimedEmail item) {
        return SHORT_LIVED_EVENTS.stream().anyMatch(item.eventKey()::startsWith)
                && item.createdAt().plus(SHORT_LIVED_CONTENT).isBefore(OffsetDateTime.now());
    }

    private static String textOrNull(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
