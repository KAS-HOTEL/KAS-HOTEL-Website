package com.kas.platform.inventory.api;

import com.kas.platform.shared.Money;

import java.time.LocalDate;
import java.util.List;

/**
 * Doc 58 §11.2.1's quote response, field for field:
 *
 * <pre>{@code
 * {
 *   "propertySlug": "kas-milestone-premium-hotel",
 *   "checkIn": "2026-09-12", "checkOut": "2026-09-14",
 *   "nights": 2,
 *   "lines": [{
 *     "roomTypeSlug": "deluxe-room",
 *     "roomTypeName": "Deluxe Room",
 *     "quantity": 2,
 *     "nightlyFrom": { "amountMinor": 1850000, "currency": "VND", "exponent": 0 },
 *     "subtotal":    { "amountMinor": 7400000, "currency": "VND", "exponent": 0 }
 *   }],
 *   "roomsSubtotal": { … }, "total": { … }, "currency": "VND", "estimate": true
 * }
 * }</pre>
 *
 * <h2>A guest shape, not the snapshot</h2>
 *
 * <p>This is <strong>not</strong> derived from doc 56 §5.2's {@code price_snapshot}. That structure
 * is internal and persisted, and it carries {@code ruleId} and {@code appliedRuleIds} — both on the
 * doc 58 §9 INTERNAL denylist. Nothing here identifies a rate rule, a priority, a specificity, an
 * inventory column, a database row or a partner. {@code PublicResponseDenylistTest} follows the
 * {@code @PublicEndpoint} annotation to this type and proves it, at any nesting depth.
 *
 * <p>There is also <strong>no tax field, no service-charge field and no zero-tax line</strong>. Tax
 * is out of KAS V1 scope by owner decision (doc 99 §12) and {@code TaxIsOutOfScopeForV1Test} keeps
 * it that way. {@code total} is the room-rate total.
 *
 * @param nights        {@code checkOut − checkIn}. The check-out night is neither occupied nor
 *                      charged — doc 55 §2
 * @param currency      the stay's currency, carried alongside the money shapes so it is legible
 *                      without reading into a line
 * @param estimate      always {@code true}. A quote is a calculation taken <em>before</em>
 *                      submission; the price a guest can hold KAS to is the snapshot written at
 *                      {@code salesStatus = REQUESTED}, and this endpoint creates nothing
 */
public record QuoteView(
        String propertySlug,
        LocalDate checkIn,
        LocalDate checkOut,
        int nights,
        List<Line> lines,
        Money roomsSubtotal,
        Money total,
        String currency,
        boolean estimate,
        /** The voucher applied, or null. */
        VoucherView voucher,
        /** What the voucher took off the rooms subtotal (0 without one). */
        Money discount,
        /** Taxes and charges, in the order applied; {@code total} includes the non-inclusive ones. */
        List<Tax> taxes,
        /** The signed-in member's discount and points for this stay, or null for a guest (2026-11-10). */
        Member member) {

    public QuoteView {
        lines = List.copyOf(lines);
        taxes = taxes == null ? List.of() : List.copyOf(taxes);
    }

    /**
     * Member pricing on this quote: the tier, its discount and the amount taken off, the points
     * the member holds, the points used here, and the most this stay can take.
     */
    public record Member(String tierCode, java.math.BigDecimal discountPercent, Money discount,
                         long pointsAvailable, long pointsUsed, java.math.BigDecimal maxRedeemPercent,
                         long pointsMaxForStay) {
    }

    /** One tax or charge. {@code ratePercent} e.g. 8 for VAT 8%. */
    public record Tax(String type, java.math.BigDecimal ratePercent, Money amount, boolean inclusive) {
    }

    /**
     * One priced line.
     *
     * @param nightlyFrom the <strong>lowest</strong> nightly rate for this room type across the
     *                    stay — the same meaning doc 58 §3.2's availability response carries. It is
     *                    a display price: when a rule varies the rate across nights,
     *                    {@code subtotal} is <em>not</em> {@code nightlyFrom × nights × quantity}
     * @param subtotal    doc 56 §3.2's frozen arithmetic for one line —
     *                    {@code Σ over nights (resolved rate) × quantity}
     */
    public record Line(
            String roomTypeSlug,
            String roomTypeName,
            int quantity,
            Money nightlyFrom,
            Money subtotal) {
    }
}
