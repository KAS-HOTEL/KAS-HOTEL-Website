package com.kas.platform.reservation.api;

import com.kas.platform.reservation.ReservationRequestService;
import com.kas.platform.identity.UserRole;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.security.KasPrincipal;
import com.kas.platform.security.PublicEndpoint;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The guest reservation request — doc 58 §3.3, governed by doc 117.
 *
 * <p>One route, no alias, no rename.
 *
 * <h2>Unauthenticated by decision, not by omission</h2>
 *
 * Guests may submit without an account. When an authenticated CUSTOMER submits,
 * the reservation is linked by account identity; email matching is never used.
 *
 * <p>CSRF still applies — {@code SecurityConfig} has no per-path exemption for
 * public POSTs, exactly as {@code POST /public/availability/quote} already shows.
 *
 * <h2>Idempotency-Key is required</h2>
 *
 * Declared {@code required = true}, so an absent header is a
 * {@code MissingRequestHeaderException} and becomes {@code 400
 * VALIDATION_FAILED} naming the header — never a 500, and never a silently
 * processed request.
 */
@RestController
@RequestMapping("/api/v1/public/reservations")
public class PublicReservationRequestController {

    private static final String DEFAULT_LOCALE = "en";
    private static final String IDEMPOTENCY_KEY = "Idempotency-Key";

    private final ReservationRequestService requests;

    public PublicReservationRequestController(ReservationRequestService requests) {
        this.requests = requests;
    }

    /**
     * Submit a booking request — S1.
     *
     * <p>Returns the frozen 201 of doc 117 §12 on a first request, and the same
     * body again on an honest retry. A same-key request with a different canonical
     * body is {@code 409 IDEMPOTENCY_KEY_REUSED} (doc 117 §24.1).
     *
     * <p>201 on a replay too: the response <em>is</em> the original result, and
     * reporting a different status would tell the caller something changed when
     * nothing did.
     */
    @PostMapping("/requests")
    @PublicEndpoint(reason = "Doc 58 §3.3 — a guest submits a booking request, anonymously "
            + "or while authenticated as CUSTOMER")
    @ResponseStatus(HttpStatus.CREATED)
    public RequestReceiptView submit(
            @RequestHeader(name = IDEMPOTENCY_KEY, required = true) String idempotencyKey,
            @Valid @RequestBody ReservationRequestBody body,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        requireUsableKey(idempotencyKey);
        java.util.UUID customerUserId = CurrentActor.find()
                .filter(principal -> principal.actor().roles().contains(UserRole.CUSTOMER))
                .map(KasPrincipal::userId)
                .orElse(null);
        return requests.submit(idempotencyKey, body, locale, customerUserId);
    }

    /**
     * The receipt for a reference — doc 58 §3's {@code /sent}.
     *
     * <p>Returns the body the {@code 201} returned, read back from the snapshot
     * it was already stored in. That is what makes a confirmation survive a
     * reload: until now the receipt existed only in the browser's memory, so a
     * guest who refreshed lost their reference entirely.
     *
     * <p>Public and untokenised because doc 58 §3 gives the route a bare
     * {@code {reference}} and the receipt carries no guest detail — no name, no
     * email, no phone, and a status literal rather than a lifecycle value.
     * {@code 404} for a reference that was never issued one.
     */
    @GetMapping("/requests/{reference}/sent")
    @PublicEndpoint(reason = "Doc 58 §3 — the guest's own confirmation screen, "
            + "keyed by the reference they were given; the receipt carries no PII")
    public RequestReceiptView sent(@PathVariable String reference) {
        return requests.receiptFor(reference);
    }

    /**
     * A blank header is not a supplied key.
     *
     * <p>{@code required = true} rejects an ABSENT header, but a present-but-empty
     * one binds as {@code ""} and used to travel all the way to the insert, where
     * V24’s {@code reservation_request_idempotency_key_not_blank} CHECK refused it
     * — after S1 had already done its work. The transaction rolled back correctly,
     * so nothing was ever persisted, but the caller was told {@code 500}
     * INTERNAL_ERROR for a mistake that is entirely their own.
     *
     * <p>This enforces the constraint the schema already declares, at the edge,
     * and answers it the way doc 58 §2.1 answers every field-level problem. It
     * invents no rule: blank was already invalid.
     */
    private static void requireUsableKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "A required header is missing.",
                    List.of(new KasException.ErrorDetail(IDEMPOTENCY_KEY, "REQUIRED",
                            "This header is required and must not be blank.")));
        }
    }
}
