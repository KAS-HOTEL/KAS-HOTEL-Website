package com.kas.platform.reservation.api;

import com.kas.platform.shared.Money;

/**
 * The frozen 201 of doc 58 §3.3, restated in doc 117 §12.
 *
 * <h2>Why this type is not called anything with "reservation" in it</h2>
 *
 * {@code ForbiddenConceptsRule} refuses a field named {@code status} or
 * {@code source} on any type whose simple name contains {@code reservation},
 * {@code booking} or {@code stay} — doc 52 §4 R13, which exists to stop
 * {@code salesStatus} and {@code stayStatus} collapsing into one generic
 * {@code status} on the reservation entity.
 *
 * <p>The frozen wire field <strong>is</strong> {@code status}, and it must not be
 * renamed. But this type is not the reservation entity: doc 58 §3.3 calls its
 * value <em>"guest vocabulary, never salesStatus"</em>, and it carries the single
 * literal {@code REQUEST_RECEIVED}. Naming the DTO for what it is — a receipt for
 * a request — keeps the architectural rule intact at full strength rather than
 * narrowing it for convenience. The entity keeps its two lifecycles, and the rule
 * keeps guarding them.
 *
 * <h2>What is absent, and why</h2>
 *
 * No {@code salesStatus}, {@code slaDueAt}, {@code holdId}, {@code expiresAt},
 * {@code partnerId}, {@code leadSource} or bare {@code total} —
 * {@code PublicResponseDenylist} forbids each in a public response, and it
 * follows {@code @PublicEndpoint} into any package, so this type is covered
 * automatically. {@code estimatedTotal} is a {@link Money}, which is the one
 * shape the denylist permits for a total.
 */
public record RequestReceiptView(
        String reference,
        String status,
        String responsePromise,
        boolean trackingUrlIssued,
        Money estimatedTotal,
        String estimateDisclaimer) {

    /** Doc 58 §3.3 — the literal the guest is shown, never a lifecycle value. */
    public static final String REQUEST_RECEIVED = "REQUEST_RECEIVED";
}
