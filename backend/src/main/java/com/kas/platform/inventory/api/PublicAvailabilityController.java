package com.kas.platform.inventory.api;

import com.kas.platform.inventory.AvailabilityService;
import com.kas.platform.security.PublicEndpoint;
import com.kas.platform.shared.Money;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Guest-facing availability — doc 58 §3.2.
 *
 * <p>Implements the frozen paths {@code GET /public/availability/properties/{slug}} and
 * {@code POST /public/availability/quote}. The third sibling doc 58 §3.2 defines is
 * <strong>not</strong> implemented here and is not silently approximated:
 *
 * <ul>
 *   <li>{@code GET /public/availability/search} — portfolio-wide search, which
 *       needs the district, amenity and sort facets of doc 58 §3.2 and a response
 *       envelope doc 58 does not define. Recorded as OQ-122.</li>
 * </ul>
 *
 * <p><strong>{@code POST /public/availability/quote} is now implemented</strong> — doc 58 §3.2
 * froze its request body and stated no response; §11.2 freezes the response, and OQ-123 is closed.
 * It creates nothing: the price snapshot belongs to the reservation-request flow at
 * {@code salesStatus = REQUESTED} (doc 56 §5.1), not to a quote.
 *
 * <p>Doc 58 §3: "Unauthenticated. <strong>Cacheable except availability.</strong>"
 * Nothing here sets a cache header, and doc 15 §10 caps any future availability
 * cache at 60 seconds with eager invalidation.
 */
@RestController
@RequestMapping("/api/v1/public/request-pricing")
public class PublicAvailabilityController {

    private static final String DEFAULT_LOCALE = "en";

    private final AvailabilityService availability;

    public PublicAvailabilityController(AvailabilityService availability) {
        this.availability = availability;
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    @GetMapping("/properties/{slug}")
    @PublicEndpoint(reason = "Doc 58 §3.2 — per-property availability for a date range")
    public List<RequestRoomOptionView> forProperty(
            @PathVariable String slug,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkIn,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkOut,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {

        return availability.requestOptions(slug, checkIn, checkOut, locale);
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    @PostMapping("/quote")
    @PublicEndpoint(reason = "Doc 58 §3.2 — a priced line set for a guest; creates nothing")
    public QuoteView quote(@Valid @RequestBody QuoteRequest request,
                           @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {

        AvailabilityService.Quote quote = availability.quote(
                request.propertySlug(), request.checkIn(), request.checkOut(),
                request.adults(), request.children(), request.childAgesOrEmpty(),
                request.lines().stream()
                        .map(line -> new AvailabilityService.QuoteLine(line.roomTypeSlug(),
                                line.quantity()))
                        .toList(),
                request.offerCode(), locale, signedInCustomerUserId(), request.pointsOrZero());

        int exponent = Money.VND.equals(quote.currency()) ? 0 : 2;
        List<QuoteView.Line> lines = quote.lines().stream()
                .map(line -> new QuoteView.Line(line.roomTypeSlug(), line.roomTypeName(),
                        line.quantity(),
                        new Money(line.nightlyFromMinor(), quote.currency(), exponent),
                        new Money(line.subtotalMinor(), quote.currency(), exponent)))
                .toList();

        var adjusted = quote.adjustment();
        return new QuoteView(quote.propertySlug(), quote.checkIn(), quote.checkOut(), quote.nights(),
                lines,
                new Money(quote.roomsSubtotalMinor(), quote.currency(), exponent),
                new Money(quote.totalMinor(), quote.currency(), exponent),
                quote.currency(),
                // Always an estimate: a quote precedes the price snapshot — doc 58 §11.2.4.
                true,
                adjusted.voucher() == null ? null : VoucherView.of(adjusted.voucher(), quote.currency()),
                new Money(adjusted.discountMinor(), quote.currency(), exponent),
                adjusted.taxes().stream().map(t -> new QuoteView.Tax(t.type(), t.ratePercent(),
                        new Money(t.amountMinor(), quote.currency(), exponent), t.inclusive())).toList(),
                adjusted.member() == null ? null : new QuoteView.Member(adjusted.member().tierCode(),
                        adjusted.member().discountPercent(),
                        new Money(adjusted.memberDiscountMinor(), quote.currency(), exponent),
                        adjusted.member().availablePoints(), adjusted.pointsUsed(),
                        adjusted.member().redemptionEnabled() ? adjusted.member().maximumRedeemPercent() : null,
                        adjusted.member().redemptionEnabled()
                                ? Math.min(adjusted.member().availablePoints(), pointsCap(adjusted)) : 0));
    }

    /** The most points this stay can take: the redemption cap on the rooms after offers. */
    private static long pointsCap(com.kas.platform.pricing.StayAdjustmentService.Adjustment a) {
        if (a.member() == null || a.member().maximumRedeemPercent() == null) return a.netMinor();
        return java.math.BigDecimal.valueOf(a.netMinor()).multiply(a.member().maximumRedeemPercent())
                .divide(java.math.BigDecimal.valueOf(100), 0, java.math.RoundingMode.DOWN).longValue();
    }

    /** The signed-in customer's user id, or null for a guest or a staff session. */
    private static java.util.UUID signedInCustomerUserId() {
        return com.kas.platform.security.CurrentActor.find()
                .map(principal -> principal.actor())
                .filter(actor -> actor.roles().contains(com.kas.platform.identity.UserRole.CUSTOMER))
                .map(actor -> actor.userId())
                .orElse(null);
    }

    /** The vouchers a guest can pick for this stay, each with its saving or why not yet. */
    @PostMapping("/vouchers")
    @PublicEndpoint(reason = "Owner decision 2026-11-09 — guests see the vouchers available for their stay")
    public List<VoucherView> vouchers(@Valid @RequestBody QuoteRequest request,
                                      @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        var lines = request.lines().stream()
                .map(line -> new AvailabilityService.QuoteLine(line.roomTypeSlug(), line.quantity()))
                .toList();
        var checks = availability.vouchers(request.propertySlug(), request.checkIn(), request.checkOut(),
                request.adults(), request.children(), request.childAgesOrEmpty(), lines, locale);
        String currency = Money.VND;
        return checks.stream().map(c -> VoucherView.of(c, c.voucher().currency() == null ? currency
                : c.voucher().currency().trim())).toList();
    }
}
