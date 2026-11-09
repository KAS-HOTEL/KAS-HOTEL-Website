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
                request.offerCode(), locale);

        int exponent = Money.VND.equals(quote.currency()) ? 0 : 2;
        List<QuoteView.Line> lines = quote.lines().stream()
                .map(line -> new QuoteView.Line(line.roomTypeSlug(), line.roomTypeName(),
                        line.quantity(),
                        new Money(line.nightlyFromMinor(), quote.currency(), exponent),
                        new Money(line.subtotalMinor(), quote.currency(), exponent)))
                .toList();

        return new QuoteView(quote.propertySlug(), quote.checkIn(), quote.checkOut(), quote.nights(),
                lines,
                new Money(quote.roomsSubtotalMinor(), quote.currency(), exponent),
                new Money(quote.totalMinor(), quote.currency(), exponent),
                quote.currency(),
                // Always an estimate: a quote precedes the price snapshot — doc 58 §11.2.4.
                true);
    }
}
