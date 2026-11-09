package com.kas.platform.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Brevo transactional transport. Credentials, recipients and tokens never enter logs.
 *
 * <p>A template event uses the Brevo template whose id is configured as
 * {@code BREVO_TEMPLATE_{KEY}_{VI|EN}}; Brevo fills its {@code {{ params.name }}} values.
 * An event with no Brevo template id (for example PASSWORD_RESET)
 * is rendered here from the reference copy in {@code resources/email-templates/} and
 * sent as HTML, so every event still reaches the guest in the house design.
 */
@Component
public class BrevoEmailClient implements EmailTransport {
    private static final Logger log = LoggerFactory.getLogger(BrevoEmailClient.class);
    private static final URI ENDPOINT = URI.create("https://api.brevo.com/v3/smtp/email");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\{\\s*(\\w+)\\s*}}}|\\{\\{\\s*params\\.(\\w+)\\s*}}");
    private final ObjectMapper json;
    private final Environment config;
    private final HttpClient http;

    @Autowired
    public BrevoEmailClient(ObjectMapper json, Environment config) {
        this(json, config, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
    }

    BrevoEmailClient(ObjectMapper json, Environment config, HttpClient http) {
        this.json = json;
        this.config = config;
        this.http = http;
    }

    @Override
    public boolean configured() {
        return !config.getProperty("kas.brevo.api-key", "").isBlank()
                && !config.getProperty("kas.brevo.sender-email", "").isBlank();
    }

    /** Non-production profiles send only to listed addresses or {@code @domain} entries. */
    boolean recipientAllowed(String to) {
        String listed = config.getProperty("kas.email.allowed-recipients", "");
        if (listed.isBlank()) return !config.getProperty("kas.email.require-allowlist", Boolean.class, false);
        String address = to.trim().toLowerCase(Locale.ROOT);
        for (String entry : listed.split(",")) {
            String allowed = entry.trim().toLowerCase(Locale.ROOT);
            if (allowed.isEmpty()) continue;
            if (allowed.startsWith("@") ? address.endsWith(allowed) : address.equals(allowed)) return true;
        }
        return false;
    }

    private SendResult refuseRecipient(String to) {
        if (to == null || to.isBlank()) {
            log.warn("Email not sent: no recipient address");
            return new SendResult(Outcome.RETRY, "RECIPIENT_MISSING");
        }
        if (!recipientAllowed(to)) {
            log.warn("Email held: recipient is not on the allowed-recipients list");
            return new SendResult(Outcome.DEFER, "RECIPIENT_NOT_ALLOWED");
        }
        return null;
    }

    @Override
    public SendResult sendTemplate(String templateKey, String country, String to,
                                   Map<String, Object> params, String eventKey) {
        SendResult refused = refuseRecipient(to);
        if (refused != null) return refused;
        String language = EmailLanguage.forCountry(country);
        Map<String, Object> values = new LinkedHashMap<>(params == null ? Map.of() : params);
        values.put("language", language);

        Optional<Long> templateId = templateId(templateKey, language);
        if (templateId.isPresent()) {
            Map<String, Object> body = envelope(to, eventKey);
            body.put("templateId", templateId.get());
            body.put("params", values);
            return post(body, true);
        }
        return renderLocal(templateKey, language, values)
                .map(rendered -> {
                    Map<String, Object> body = envelope(to, eventKey);
                    body.put("subject", rendered[0]);
                    body.put("htmlContent", rendered[1]);
                    return post(body, true);
                })
                .orElseGet(() -> {
                    log.warn("Email not sent: no Brevo template id and no local design for {}_{}", templateKey, language);
                    return new SendResult(Outcome.DEFER, "TEMPLATE_NOT_CONFIGURED");
                });
    }

    @Override
    public SendResult sendInline(String to, String subject, String html, String eventKey) {
        SendResult refused = refuseRecipient(to);
        if (refused != null) return refused;
        Map<String, Object> body = envelope(to, eventKey);
        body.put("subject", subject);
        body.put("htmlContent", "<html><body>" + html + "</body></html>");
        return post(body, false);
    }

    /** {@code BREVO_TEMPLATE_BOOKING_CONFIRMED_VI}, read as an environment variable. */
    Optional<Long> templateId(String templateKey, String language) {
        String raw = config.getProperty("BREVO_TEMPLATE_" + templateKey + "_" + language.toUpperCase(Locale.ROOT), "").trim();
        try {
            long id = Long.parseLong(raw);
            return id > 0 ? Optional.of(id) : Optional.empty();
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
    }

    /** {subject, html} from {@code email-templates/{KEY}_{LANG}}, values HTML escaped. */
    Optional<String[]> renderLocal(String templateKey, String language, Map<String, Object> values) {
        String name = "email-templates/" + templateKey + "_" + language.toUpperCase(Locale.ROOT);
        ClassPathResource html = new ClassPathResource(name + ".html");
        ClassPathResource subject = new ClassPathResource(name + ".subject.txt");
        if (!html.exists() || !subject.exists()) return Optional.empty();
        try {
            return Optional.of(new String[]{
                    fill(subject.getContentAsString(StandardCharsets.UTF_8).trim(), values, false),
                    fill(html.getContentAsString(StandardCharsets.UTF_8), values, true)});
        } catch (java.io.IOException ex) {
            log.error("Email design could not be read: {}", name);
            return Optional.empty();
        }
    }

    private static String fill(String text, Map<String, Object> values, boolean html) {
        Matcher placeholder = PLACEHOLDER.matcher(text);
        StringBuilder out = new StringBuilder();
        while (placeholder.find()) {
            String key = placeholder.group(1) != null ? placeholder.group(1) : placeholder.group(2);
            Object value = values.get(key);
            String filled = value == null ? "" : value.toString();
            placeholder.appendReplacement(out, Matcher.quoteReplacement(html ? escape(filled) : filled));
        }
        return placeholder.appendTail(out).toString();
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }

    private Map<String, Object> envelope(String to, String eventKey) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sender", Map.of("email", config.getProperty("kas.brevo.sender-email", "").trim(),
                "name", config.getProperty("kas.brevo.sender-name", "KAS Hotel Collection").trim()));
        body.put("to", List.of(Map.of("email", to)));
        body.put("headers", Map.of("idempotencyKey",
                UUID.nameUUIDFromBytes(eventKey.getBytes(StandardCharsets.UTF_8)).toString()));
        return body;
    }

    private SendResult post(Map<String, Object> body, boolean template) {
        if (!configured()) {
            log.warn("Email not sent: Brevo key or sender configuration is missing");
            return new SendResult(Outcome.DEFER, "BREVO_NOT_CONFIGURED");
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(8))
                    .header("api-key", config.getProperty("kas.brevo.api-key", ""))
                    .header("accept", "application/json").header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) return SendResult.ACCEPTED;
            String providerCode = providerCode(response.body());
            log.error("Brevo email rejected (HTTP {} {})", status, providerCode);
            String code = "BREVO_HTTP_" + status + "_" + providerCode.toUpperCase(Locale.ROOT);
            // A bad key, an unauthorised sender or a broken template is not this
            // email's fault: it waits for the fix instead of spending its attempts.
            boolean environmentFault = status == 401 || status == 403 || (template && (status == 400 || status == 404));
            return new SendResult(environmentFault ? Outcome.DEFER : Outcome.RETRY, code);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn("Brevo email interrupted");
            return new SendResult(Outcome.RETRY, "DELIVERY_INTERRUPTED");
        } catch (Exception ex) {
            log.error("Brevo email request failed ({})", ex.getClass().getSimpleName());
            return new SendResult(Outcome.RETRY, "BREVO_CONNECTION_ERROR");
        }
    }

    /** Brevo's machine code only; its {@code message} can repeat an address, so it is never read. */
    private String providerCode(String body) {
        try {
            String code = json.readTree(body == null ? "{}" : body).path("code").asText("");
            return code.matches("[a-z0-9_]{1,40}") ? code : "unknown";
        } catch (Exception ex) {
            return "unknown";
        }
    }
}
