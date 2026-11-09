package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kas.platform.reservation.api.RequestReceiptView;
import com.kas.platform.reservation.api.ReservationRequestBody;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.NotFoundException;
import org.springframework.stereotype.Service;

import org.springframework.dao.DuplicateKeyException;
import java.util.Optional;

/**
 * The reservation request surface — doc 117.
 *
 * <p>This class owns only the idempotency decision. The work itself is
 * {@link S1Transaction}, a separate bean so that a failed S1 can roll back
 * completely and still be followed by a fresh read here.
 *
 * <h2>The three outcomes doc 117 §24.1 freezes</h2>
 *
 * <ol>
 *   <li><strong>New key</strong> — run S1, persist key + fingerprint + response.</li>
 *   <li><strong>Same key, same fingerprint</strong> — return the original result.
 *       No second reservation, no second hold, no 409.</li>
 *   <li><strong>Same key, different fingerprint</strong> — {@code 409
 *       IDEMPOTENCY_KEY_REUSED}. Nothing is created and nothing is mutated.</li>
 * </ol>
 *
 * <p>{@code DUPLICATE_REFERENCE} is never returned here; doc 117 §5.4 keeps it
 * OTA-only.
 */
@Service
public class ReservationRequestService {

    /** How many references one submission may draw before giving up. */
    private static final int REFERENCE_ATTEMPTS = 3;

    /** The V12 constraint a reference collision arrives as. */
    private static final String REFERENCE_CONSTRAINT = "reservation_reference_key";

    private final S1Transaction s1;
    private final IdempotencyRepository idempotency;
    private final ObjectMapper json;

    ReservationRequestService(S1Transaction s1, IdempotencyRepository idempotency,
                              ObjectMapper json) {
        this.s1 = s1;
        this.idempotency = idempotency;
        this.json = json;
    }

    public RequestReceiptView submit(String idempotencyKey, ReservationRequestBody body,
                                     String locale) {
        return submit(idempotencyKey, body, locale, null);
    }

    /** Authenticated CUSTOMER submissions bind the reservation to that account. */
    public RequestReceiptView submit(String idempotencyKey, ReservationRequestBody body,
                                     String locale, java.util.UUID customerUserId) {
        String fingerprint = RequestFingerprint.of(body);

        Optional<RequestReceiptView> replay = replayIfRecorded(idempotencyKey, fingerprint);
        if (replay.isPresent()) {
            return replay.get();
        }

        /*
          The reference-collision retry.

          `ReservationReference` draws five random digits per branch — a space
          of 100,000 — and the UNIQUE constraint on `reservation.reference` is
          what actually guarantees uniqueness. A collision is therefore
          expected eventually, and it arrives as a DuplicateKeyException from
          the insert.

          It has to be retried out here rather than inside S1. A unique
          violation aborts the Postgres transaction: every statement after it
          fails until rollback, so a loop around the insert could not recover.
          Each attempt is a fresh `s1.execute`, and therefore a fresh
          transaction and a fresh draw.

          Bounded, and small. Three attempts against a 1-in-100,000 draw is not
          a number chosen to be lucky — by the third attempt a genuine
          exhaustion of the branch's space is the likelier explanation, and
          that deserves a real failure rather than a longer loop.
        */
        for (int attempt = 1; ; attempt++) {
            try {
                return s1.execute(idempotencyKey, fingerprint, body, locale, customerUserId);
            } catch (RuntimeException failure) {
                // S1 failed. Before reporting that, check whether this exact request
                // was meanwhile fulfilled by another caller holding the same key.
                //
                // Two ways that happens, and both must answer with the original:
                //
                //   * the loser reached the idempotency INSERT and hit the PRIMARY KEY;
                //   * the loser never got that far, because the winner took the rooms
                //     first and the under-lock re-check refused it with NO_AVAILABILITY.
                //
                // The second is the common one and is why this catches more than
                // DuplicateKeyException. Telling a guest "no availability" for a
                // request that has just succeeded under their own key would be a lie
                // about their own booking.
                //
                // This swallows nothing. The stored key is only accepted as an answer
                // when its fingerprint matches this request exactly; a stored key for
                // a DIFFERENT body still raises 409, and if no key was recorded the
                // original failure is rethrown untouched.
                Optional<RequestReceiptView> fulfilledByAnother =
                        replayIfRecorded(idempotencyKey, fingerprint);
                if (fulfilledByAnother.isPresent()) {
                    return fulfilledByAnother.get();
                }

                // Checked after the replay, never before: a duplicate idempotency
                // key is also a DuplicateKeyException, and that one means "this
                // exact request already succeeded", not "draw again".
                if (attempt < REFERENCE_ATTEMPTS && isReferenceCollision(failure)) {
                    continue;
                }

                throw failure;
            }
        }
    }

    /**
     * Whether this failure is the reference constraint specifically.
     *
     * <p>Matched on the constraint name rather than on the exception type: the
     * same S1 transaction can violate the idempotency primary key and the
     * reference unique index, and only one of those may be retried. Postgres
     * names the offending constraint in its message, which is the only place
     * that distinction is available.
     */
    private static boolean isReferenceCollision(RuntimeException failure) {
        if (!(failure instanceof DuplicateKeyException duplicate)) {
            return false;
        }
        String message = duplicate.getMostSpecificCause().getMessage();
        return message != null && message.contains(REFERENCE_CONSTRAINT);
    }

    /**
     * The receipt a reference was issued — doc 58 §3's
     * {@code GET /public/reservations/requests/{reference}/sent}.
     *
     * <p>Reads back the stored snapshot rather than rebuilding one, so a guest
     * who reloads sees <strong>the receipt they were shown</strong>, not a fresh
     * rendering that config or a correction could have moved since.
     *
     * <p>It reports nothing about the request's progress. {@code status} is doc
     * 58 §3.3's literal — <em>"the literal the guest is shown, never a lifecycle
     * value"</em> — so this cannot become a way to learn from a guessable
     * reference whether a booking was won or declined.
     *
     * @throws NotFoundException when no request was issued under that reference
     */
    public RequestReceiptView receiptFor(String reference) {
        return idempotency.findReceiptByReference(reference)
                .map(this::read)
                .orElseThrow(() -> new NotFoundException("Request not found"));
    }

    /**
     * What an already-recorded key answers.
     *
     * <p>Empty means the key is unused. A stored key whose fingerprint differs
     * never returns a result — it raises, because returning the original would be
     * treating a different request as a retry, which doc 117 §24.1 forbids.
     */
    private Optional<RequestReceiptView> replayIfRecorded(String idempotencyKey,
                                                          String fingerprint) {
        Optional<IdempotencyRepository.StoredRequest> stored = idempotency.find(idempotencyKey);
        if (stored.isEmpty()) {
            return Optional.empty();
        }
        if (!stored.get().requestFingerprint().equals(fingerprint)) {
            throw ConflictException.idempotencyKeyReused();
        }
        return Optional.of(read(stored.get().responseSnapshotJson()));
    }

    private RequestReceiptView read(String snapshot) {
        try {
            return json.readValue(snapshot, RequestReceiptView.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("stored reservation response is unreadable", e);
        }
    }
}
