package com.kas.platform.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kas.platform.shared.EmailTransport.Outcome;
import com.kas.platform.shared.EmailTransport.SendResult;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EmailOutboxDispatcherTest {
    private static final String KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private final EmailOutboxRepository repository = mock(EmailOutboxRepository.class);
    private final EmailTransport transport = mock(EmailTransport.class);
    private final ObjectMapper json = new ObjectMapper();
    private final EmailOutboxCipher cipher = new EmailOutboxCipher(KEY, "");
    private final UUID id = UUID.randomUUID();

    private EmailOutboxDispatcher dispatcher(int maxAttempts) {
        when(transport.configured()).thenReturn(true);
        return new EmailOutboxDispatcher(repository, cipher, transport, json, maxAttempts, 10);
    }

    @Test
    void successfulProviderAcceptanceMarksEventSentWithStableKey() throws Exception {
        when(repository.claim(10, 5)).thenReturn(List.of(item("event-1", 1, OffsetDateTime.now())));
        when(transport.sendInline("guest@example.invalid", "Subject", "<p>hello</p>", "event-1"))
                .thenReturn(SendResult.ACCEPTED);

        dispatcher(5).dispatchDue();

        verify(repository).markSent(id);
        verify(repository, never()).markFailed(any(), anyInt(), anyInt(), any(), anyString());
    }

    @Test
    void failedProviderAcceptanceSchedulesRetryThenStopsAtAttemptLimit() throws Exception {
        when(repository.claim(10, 2)).thenReturn(List.of(item("event-1", 1, OffsetDateTime.now())))
                .thenReturn(List.of(item("event-1", 2, OffsetDateTime.now())));
        when(transport.sendInline(anyString(), anyString(), anyString(), eq("event-1")))
                .thenReturn(new SendResult(Outcome.RETRY, "BREVO_HTTP_500"));
        EmailOutboxDispatcher dispatcher = dispatcher(2);

        dispatcher.dispatchDue();
        dispatcher.dispatchDue();

        verify(repository).markFailed(eq(id), eq(1), eq(2), any(), eq("BREVO_HTTP_500"));
        verify(repository).markFailed(eq(id), eq(2), eq(2), any(), eq("BREVO_HTTP_500"));
        verify(repository, never()).markSent(id);
    }

    @Test
    void aMissingConfigurationLeavesTheQueueUntouched() {
        when(transport.configured()).thenReturn(false);

        new EmailOutboxDispatcher(repository, cipher, transport, json, 5, 10).dispatchDue();

        verifyNoInteractions(repository);
    }

    @Test
    void aConfigurationFaultHoldsTheMailInsteadOfSpendingItsAttempts() throws Exception {
        when(repository.claim(10, 5)).thenReturn(List.of(item("event-1", 1, OffsetDateTime.now())));
        when(transport.sendInline(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(new SendResult(Outcome.DEFER, "RECIPIENT_NOT_ALLOWED"));

        dispatcher(5).dispatchDue();

        verify(repository).defer(eq(id), any(), eq("RECIPIENT_NOT_ALLOWED"));
        verify(repository, never()).markFailed(any(), anyInt(), anyInt(), any(), anyString());
    }

    @Test
    void aPayloadThatCannotBeDecryptedIsKeptForTheRightKey() throws Exception {
        var foreign = new EmailOutboxCipher("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", "");
        when(repository.claim(10, 5)).thenReturn(List.of(item(foreign, "event-1", 1, OffsetDateTime.now())));

        dispatcher(5).dispatchDue();

        verify(repository).defer(eq(id), any(), eq("PAYLOAD_DECRYPTION_FAILED"));
        verify(transport, never()).sendInline(any(), any(), any(), any());
    }

    @Test
    void anExpiredCodeIsNeverSentButLongLivedMailStillIs() throws Exception {
        OffsetDateTime old = OffsetDateTime.now().minusMinutes(31);
        when(repository.claim(10, 5)).thenReturn(List.of(
                item("member-email-verification-1", 1, old),
                item("customer-password-reset-1", 1, old),
                item("booking-guest-1", 1, old)));
        when(transport.sendInline(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(SendResult.ACCEPTED);

        dispatcher(5).dispatchDue();

        verify(repository, times(2)).markFailed(eq(id), eq(5), eq(5), any(), eq("CONTENT_EXPIRED"));
        verify(transport).sendInline(anyString(), anyString(), anyString(), eq("booking-guest-1"));
        verify(transport, never()).sendInline(anyString(), anyString(), anyString(), eq("member-email-verification-1"));
    }

    private EmailOutboxRepository.ClaimedEmail item(String eventKey, int attempt, OffsetDateTime createdAt) throws Exception {
        return item(cipher, eventKey, attempt, createdAt);
    }

    private EmailOutboxRepository.ClaimedEmail item(EmailOutboxCipher with, String eventKey, int attempt,
                                                    OffsetDateTime createdAt) throws Exception {
        byte[] clear = json.writeValueAsString(Map.of(
                "kind", "INLINE",
                "recipient", "guest@example.invalid",
                "name", "Guest",
                "subject", "Subject",
                "html", "<p>hello</p>" )).getBytes(StandardCharsets.UTF_8);
        var encrypted = with.encrypt(clear);
        return new EmailOutboxRepository.ClaimedEmail(id, eventKey, encrypted.nonce(),
                encrypted.ciphertext(), attempt, createdAt);
    }
}
