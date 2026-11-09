/**
 * Direct reservation requests — the S1 transition of doc 54 §4.
 *
 * <p>This module arrives in Phase 7.5F Step 16A **with behaviour**, which is the
 * condition {@code ModuleStructureTest} always attached to it: <em>"inventory,
 * pricing, sales, reservation, customer, review, notification and payment are
 * therefore still absent — they arrive with behaviour, not before it."</em>
 *
 * <h2>What it owns</h2>
 *
 * One endpoint — {@code POST /api/v1/public/reservations/requests} — and the S1
 * transaction behind it: reference, price snapshot, request holds, SLA deadline,
 * reservation lines, status history, and the durable idempotency record. The
 * governing contract is doc 117.
 *
 * <h2>What it does not own</h2>
 *
 * <ul>
 *   <li><strong>Rates.</strong> {@code RateResolver} is the only rate authority.
 *       This module consumes {@code AvailabilityService.priceRequest}, which
 *       validates and prices exactly as the quote does, and never resolves a rate
 *       itself.</li>
 *   <li><strong>Availability and allocation.</strong> Doc 55 §1 makes
 *       {@code inventory} <em>"the single availability engine for every
 *       channel"</em>. Locking, the {@code available_direct} re-check, the
 *       {@code direct_committed} increment and hold placement all live there.</li>
 *   <li><strong>Delivery.</strong> S1's acknowledgement and sales notification are
 *       business effects. Doc 117 §8.1 keeps delivery out of Step 16A, and
 *       OQ-162 remains open: there is no mail sender, no queue, no provider.</li>
 *   <li><strong>Sales workflow.</strong> S2 onward, the alternative-offer flow
 *       (B1/S7) and the WON transition (S10) are later steps.</li>
 * </ul>
 *
 * <h2>Deliberate absences</h2>
 *
 * <ul>
 *   <li>No payment, voucher, discount, fee or tax. Doc 99 §12 puts tax outside
 *       V1, and {@code TaxIsOutOfScopeForV1Test} enforces it.</li>
 *   <li>No customer account requirement. Anonymous bookings remain supported
 *       with contact details and a nullable {@code reservation.customer_id};
 *       authenticated customer bookings may link to the account for customer
 *       self-service.</li>
 *   <li>No policy validation. OQ-167 is closed: {@code acceptedTermsVersion} is
 *       stored opaquely and never looked up.</li>
 *   <li>The snapshot is typed by doc 125, which closed OQ-171: {@code version} is
 *       the revision number (1 at S1, never {@code reservation.version});
 *       {@code propertyId} and {@code propertyName} freeze the property's
 *       identity; {@code appliedRuleIds} is the ordered distinct union of
 *       {@code nights[].ruleId}; and {@code nightly_price_minor} is written only
 *       when a line's nights share one rate. None of it reaches a guest —
 *       {@code appliedRuleIds} and {@code ruleId} stay on doc 58 §9's
 *       denylist.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Reservation Requests",
        allowedDependencies = {"shared", "inventory", "pricing", "property", "settings", "customer",
                "identity", "audit", "security", "web"})
package com.kas.platform.reservation;
