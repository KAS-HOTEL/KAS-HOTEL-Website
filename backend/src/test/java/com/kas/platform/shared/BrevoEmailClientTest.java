package com.kas.platform.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kas.platform.shared.EmailTransport.Outcome;
import com.kas.platform.shared.EmailTransport.SendResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.env.MockEnvironment;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class BrevoEmailClientTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @CsvSource({"VN,11", "US,22"})
    void aConfiguredBrevoTemplateIsUsedByNationality(String country, long templateId) throws Exception {
        HttpClient http = responding(201, "{\"messageId\":\"<x>\"}");
        var result = new BrevoEmailClient(json, settings(), http).sendTemplate("BOOKING_CONFIRMED", country,
                "guest@example.invalid", Map.of("bookingReference", "TEST-REF"), "event-1");

        assertThat(result.outcome()).isEqualTo(Outcome.ACCEPTED);
        HttpRequest request = sent(http);
        var payload = json.readTree(body(request));
        assertThat(request.uri().toString()).isEqualTo("https://api.brevo.com/v3/smtp/email");
        assertThat(request.headers().firstValue("api-key")).contains("synthetic-brevo-key");
        assertThat(payload.path("templateId").asLong()).isEqualTo(templateId);
        assertThat(payload.path("params").path("bookingReference").asText()).isEqualTo("TEST-REF");
        assertThat(payload.path("sender").path("email").asText()).isEqualTo("sender@example.invalid");
        assertThat(payload.path("to").get(0).path("email").asText()).isEqualTo("guest@example.invalid");
        assertThat(payload.has("htmlContent")).isFalse();
    }

    @Test void withoutABrevoTemplateTheLocalDesignIsRenderedAndEscaped() throws Exception {
        HttpClient http = responding(201, "{}");
        var result = new BrevoEmailClient(json, settings(), http).sendTemplate("PASSWORD_RESET", "VN",
                "guest@example.invalid", Map.of("resetUrl", "https://site.example.invalid/r?token=a&b=<c>", "expiryMinutes", "30"), "e");

        assertThat(result.outcome()).isEqualTo(Outcome.ACCEPTED);
        var payload = json.readTree(body(sent(http)));
        assertThat(payload.has("templateId")).isFalse();
        assertThat(payload.path("subject").asText()).isNotBlank();
        assertThat(payload.path("htmlContent").asText())
                .contains("https://site.example.invalid/r?token=a&amp;b=&lt;c&gt;").contains("30")
                .doesNotContain("{{{");
    }

    @Test void anEventWithNeitherATemplateNorADesignIsHeldWithoutANetworkCall() {
        HttpClient http = mock(HttpClient.class);
        assertThat(new BrevoEmailClient(json, settings(), http).sendTemplate("NO_SUCH_TEMPLATE", "VN",
                "guest@example.invalid", Map.of(), "e")).isEqualTo(new SendResult(Outcome.DEFER, "TEMPLATE_NOT_CONFIGURED"));
        verifyNoInteractions(http);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "401 | {\"code\":\"unauthorized\",\"message\":\"Key not found\"} | DEFER | BREVO_HTTP_401_UNAUTHORIZED",
            "400 | {\"code\":\"invalid_parameter\",\"message\":\"bad guest@example.invalid\"} | DEFER | BREVO_HTTP_400_INVALID_PARAMETER",
            "429 | {\"code\":\"too_many_requests\"} | RETRY | BREVO_HTTP_429_TOO_MANY_REQUESTS",
            "503 | not json | RETRY | BREVO_HTTP_503_UNKNOWN"})
    void aRefusalBecomesAStorableCodeWithoutTheProviderMessage(int status, String response, String outcome, String code) throws Exception {
        var result = new BrevoEmailClient(json, settings(), responding(status, response))
                .sendTemplate("BOOKING_CONFIRMED", "VN", "guest@example.invalid", Map.of(), "e");
        assertThat(result.outcome().name()).isEqualTo(outcome);
        assertThat(result.code()).isEqualTo(code);
    }

    @Test void missingConfigurationAndTheAllowlistHoldMailBeforeAnyNetworkCall() {
        HttpClient http = mock(HttpClient.class);
        var noKey = new MockEnvironment().withProperty("kas.brevo.sender-email", "sender@example.invalid");
        assertThat(new BrevoEmailClient(json, noKey, http).sendInline("guest@example.invalid", "S", "<p>B</p>", "e"))
                .isEqualTo(new SendResult(Outcome.DEFER, "BREVO_NOT_CONFIGURED"));
        var held = settings().withProperty("kas.email.allowed-recipients", "@qa.example.invalid");
        assertThat(new BrevoEmailClient(json, held, http).sendInline("guest@example.invalid", "S", "<p>B</p>", "e"))
                .isEqualTo(new SendResult(Outcome.DEFER, "RECIPIENT_NOT_ALLOWED"));
        verifyNoInteractions(http);
    }

    @Test void aConnectionFailureIsRetried() throws Exception {
        HttpClient http = mock(HttpClient.class);
        doThrow(new java.io.IOException("offline")).when(http).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        assertThat(new BrevoEmailClient(json, settings(), http).sendInline("guest@example.invalid", "S", "<p>B</p>", "e"))
                .isEqualTo(new SendResult(Outcome.RETRY, "BREVO_CONNECTION_ERROR"));
    }

    private MockEnvironment settings() {
        return new MockEnvironment().withProperty("kas.brevo.api-key", "synthetic-brevo-key")
                .withProperty("kas.brevo.sender-email", "sender@example.invalid")
                .withProperty("BREVO_TEMPLATE_BOOKING_CONFIRMED_VI", "11")
                .withProperty("BREVO_TEMPLATE_BOOKING_CONFIRMED_EN", "22");
    }

    private HttpRequest sent(HttpClient http) throws Exception {
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        return request.getValue();
    }

    @SuppressWarnings("unchecked")
    private HttpClient responding(int status, String responseBody) throws Exception {
        HttpClient http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(responseBody);
        doReturn(response).when(http).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        return http;
    }

    private String body(HttpRequest request) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        CompletableFuture<String> result = new CompletableFuture<>();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            public void onNext(ByteBuffer buffer) { byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk); }
            public void onError(Throwable error) { result.completeExceptionally(error); }
            public void onComplete() { result.complete(bytes.toString(StandardCharsets.UTF_8)); }
        });
        return result.join();
    }
}
