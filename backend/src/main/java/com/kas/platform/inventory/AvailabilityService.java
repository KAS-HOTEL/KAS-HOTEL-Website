package com.kas.platform.inventory;

import com.kas.platform.pricing.PublishedRateRepository;
import com.kas.platform.pricing.RateResolver;
import com.kas.platform.pricing.ResolvedRate;
import com.kas.platform.property.BasePrice;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.Money;

import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
@Service
public class AvailabilityService {

    private final PublishedAvailabilityRepository published;
    private final PublishedRateRepository rates;
    private final Clock clock;

    public AvailabilityService(PublishedAvailabilityRepository published,
                               PublishedRateRepository rates,
                               Clock clock) {
        this.published = published;
        this.rates = rates;
        this.clock = clock;
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */


    /** Date-based price estimates. Hotel staff checks availability manually. */
    public List<com.kas.platform.inventory.api.RequestRoomOptionView> requestOptions(
            String slug, LocalDate checkIn, LocalDate checkOut, String locale) {
        requireUsableStay(checkIn, checkOut);
        Map<UUID, BasePrice> bases = rates.basePrices(slug);
        Map<UUID, String> names = rates.names(slug, locale);
        List<com.kas.platform.inventory.api.RequestRoomOptionView> options = new ArrayList<>();
        for (RequestRoom room : published.requestRooms(slug, null)) {
            Optional<Money> price = lowestNightly(room.roomTypeId(), bases.get(room.roomTypeId()), checkIn, checkOut);
            String name = names.get(room.roomTypeId());
            if (price.isPresent() && name != null) options.add(new com.kas.platform.inventory.api.RequestRoomOptionView(
                    room.roomTypeSlug(), name, price.get()));
        }
        return List.copyOf(options);
    }

    // --------------------------------------------------------------------- quote

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    public Quote quote(String propertySlug, LocalDate checkIn, LocalDate checkOut, int adults,
                       int children, List<Integer> childAges, List<QuoteLine> lines, String offerCode,
                       String locale) {

        PricedRequest priced = priceRequest(propertySlug, checkIn, checkOut, adults, children,
                childAges, lines, offerCode, locale);

        List<QuotedLine> quoted = priced.lines().stream()
                .map(line -> new QuotedLine(line.roomTypeSlug(), line.roomTypeName(),
                        line.quantity(), line.nightlyFromMinor(), line.subtotalMinor()))
                .toList();

        // No tax and no voucher: the total is the room-rate total. Doc 99 §12 — V1 has no tax step,
        // and config B23 keeps vouchers out, which is why an offer code was refused.
        return new Quote(propertySlug, checkIn, checkOut, priced.nights(), quoted,
                priced.roomsSubtotalMinor(), priced.roomsSubtotalMinor(), priced.currency());
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    public PricedRequest priceRequest(String propertySlug, LocalDate checkIn, LocalDate checkOut,
                                      int adults, int children, List<Integer> childAges,
                                      List<QuoteLine> lines, String offerCode, String locale) {

        return pricePublishedRequest(propertySlug, checkIn, checkOut, adults, children,
                childAges, lines, offerCode, locale);
    }

    /** Prices a guest's request without asserting availability; hotel staff checks it manually. */
    public PricedRequest priceRequestForManualReview(String propertySlug, LocalDate checkIn,
                                      LocalDate checkOut, int adults, int children,
                                      List<Integer> childAges, List<QuoteLine> lines,
                                      String offerCode, String locale) {
        return pricePublishedRequest(propertySlug, checkIn, checkOut, adults, children,
                childAges, lines, offerCode, locale);
    }

    private PricedRequest pricePublishedRequest(String propertySlug, LocalDate checkIn, LocalDate checkOut,
                                      int adults, int children, List<Integer> childAges,
                                      List<QuoteLine> lines, String offerCode, String locale) {

        requireUsableStay(checkIn, checkOut);
        requireNoChildren(children, childAges);
        requireNoOfferCode(offerCode);
        requireDistinctLines(lines);

        List<String> slugs = lines.stream().map(QuoteLine::roomTypeSlug).toList();
        Map<String, RequestRoom> bookable = published.requestRooms(propertySlug, slugs).stream()
                .collect(java.util.stream.Collectors.toMap(RequestRoom::roomTypeSlug, room -> room));

        Map<UUID, BasePrice> basePrices = rates.basePrices(propertySlug);
        Map<UUID, String> names = rates.names(propertySlug, locale);

        int nights = nights(checkIn, checkOut);
        long capacity = 0;
        long roomsSubtotal = 0;
        String currency = null;
        List<PricedLine> priced = new ArrayList<>();

        for (QuoteLine line : lines) {
            RequestRoom availability = bookable.get(line.roomTypeSlug());
            if (availability == null) {
                throw notBookable(line.roomTypeSlug());
            }
            String name = names.get(availability.roomTypeId());
            if (name == null) {
                // Presentable in this locale or not sellable — the same rule the availability
                // response applies by dropping the room type.
                throw notBookable(line.roomTypeSlug());
            }

            capacity += (long) availability.maxOccupancy() * line.quantity();

            StayPrice price = priceStay(availability.roomTypeId(),
                    basePrices.get(availability.roomTypeId()), checkIn, checkOut,
                    line.roomTypeSlug());

            if (currency == null) {
                currency = price.currency();
            } else if (!currency.equals(price.currency())) {
                // Fail closed: a stay priced in two currencies cannot be totalled, and inventing a
                // conversion is exactly what doc 56 §6 forbids while B22 is unsupplied.
                throw new BusinessRuleException(ApiErrorCode.CONFIG_MISSING,
                        "These rooms are priced in different currencies and cannot be quoted "
                                + "together.");
            }

            long subtotal = price.total() * line.quantity();
            roomsSubtotal += subtotal;
            priced.add(new PricedLine(line.roomTypeSlug(), availability.roomTypeId(), name,
                    line.quantity(), price.lowestNightly(), subtotal, price.nights()));
        }

        requirePartyFits(adults, children, capacity);

        return new PricedRequest(propertySlug, checkIn, checkOut, nights, List.copyOf(priced),
                roomsSubtotal, currency);
    }

    /** One priced line, with the per-night detail the snapshot records. */
    public record PricedLine(String roomTypeSlug, UUID roomTypeId, String roomTypeName,
                             int quantity, long nightlyFromMinor, long subtotalMinor,
                             List<ResolvedRate> nights) {
        public PricedLine {
            nights = List.copyOf(nights);
        }
    }

    /** A validated, priced request. Creates nothing. */
    public record PricedRequest(String propertySlug, LocalDate checkIn, LocalDate checkOut,
                                int nights, List<PricedLine> lines, long roomsSubtotalMinor,
                                String currency) {
        public PricedRequest {
            lines = List.copyOf(lines);
        }
    }


    /** One requested room type and how many of it. */
    public record QuoteLine(String roomTypeSlug, int quantity) {
    }

    /** One priced line. Amounts are minor units of {@link Quote#currency()}. */
    public record QuotedLine(String roomTypeSlug, String roomTypeName, int quantity,
                             long nightlyFromMinor, long subtotalMinor) {
    }

    /**
     * A priced line set.
     *
     * <p>{@code total} equals {@code roomsSubtotal} in V1 and is carried separately because doc 58
     * §11.2.1 names both: the day a voucher layer arrives they diverge, and a consumer that had
     * read {@code roomsSubtotal} as the payable amount would then be silently wrong.
     */
    public record Quote(String propertySlug, LocalDate checkIn, LocalDate checkOut, int nights,
                        List<QuotedLine> lines, long roomsSubtotalMinor, long totalMinor,
                        String currency) {
    }

    /** The whole-stay price of one room, and its cheapest night. */
    private record StayPrice(long total, long lowestNightly, String currency,
                             List<ResolvedRate> nights) {
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    private StayPrice priceStay(UUID roomTypeId, BasePrice basePrice, LocalDate checkIn,
                                LocalDate checkOut, String roomTypeSlug) {
        Optional<BasePrice> base = Optional.ofNullable(basePrice);
        long total = 0;
        long lowest = Long.MAX_VALUE;
        String currency = null;
        List<ResolvedRate> nights = new ArrayList<>();

        for (LocalDate night = checkIn; night.isBefore(checkOut); night = night.plusDays(1)) {
            // The same precedence the availability list uses — a quote and the
            // list it came from must never disagree about what a night costs.
            Optional<ResolvedRate> rate = rateFor(roomTypeId, base, night);
            if (rate.isEmpty()) {
                throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                        "That stay cannot be priced.",
                        List.of(new KasException.ErrorDetail(roomTypeSlug, "NOT_PRICED",
                                "No rate is configured for " + night + ".")));
            }
            total += rate.get().amountMinor();
            lowest = Math.min(lowest, rate.get().amountMinor());
            currency = rate.get().currency();
            nights.add(rate.get());
        }
        return new StayPrice(total, lowest, currency, List.copyOf(nights));
    }

    // ------------------------------------------------------- the V1 quote refusals

    /** Config B10 is OPEN — OQ-007. Doc 58 §11.2.3. Checked before capacity and before pricing. */
    private static void requireNoChildren(int children, List<Integer> childAges) {
        boolean agesSupplied = childAges != null && !childAges.isEmpty();
        if (children > 0 || agesSupplied) {
            throw new BusinessRuleException(ApiErrorCode.CONFIG_MISSING,
                    "Bookings with children cannot be quoted online yet. Please contact us directly.",
                    List.of(new KasException.ErrorDetail("children", "CHILD_PRICING_UNSUPPORTED",
                            "Child pricing and age bands are config B10 and have not been supplied, "
                                    + "so a child cannot be priced as an adult or as free.")));
        }
    }

    /** Config B23 is OPEN — OQ-029. A supplied code is refused, never silently dropped. */
    private static void requireNoOfferCode(String offerCode) {
        if (offerCode != null && !offerCode.isBlank()) {
            throw new BusinessRuleException(ApiErrorCode.CONFIG_MISSING,
                    "Offer codes cannot be applied online yet. Please contact us directly.",
                    List.of(new KasException.ErrorDetail("offerCode", "VOUCHER_UNSUPPORTED",
                            "Voucher rules are config B23 and have not been supplied.")));
        }
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    private static void requirePartyFits(int adults, int children, long capacity) {
        long party = (long) adults + children;
        if (party > capacity) {
            throw new BusinessRuleException(ApiErrorCode.OCCUPANCY_EXCEEDED,
                    "Those rooms do not hold " + party + " guests.",
                    List.of(new KasException.ErrorDetail("adults", "OVER_CAPACITY",
                            "The rooms selected hold " + capacity
                                    + ". Add a room or reduce the number of guests.")));
        }
    }

    /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
    private static void requireDistinctLines(List<QuoteLine> lines) {
        long distinct = lines.stream().map(QuoteLine::roomTypeSlug).distinct().count();
        if (distinct != lines.size()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Each room type may appear once.",
                    List.of(new KasException.ErrorDetail("lines", "DUPLICATE_ROOM_TYPE",
                            "Combine the quantities into a single line.")));
        }
    }

    private static BusinessRuleException notBookable(String roomTypeSlug) {
        return new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "One of those room types is not published for requests.",
                List.of(new KasException.ErrorDetail(roomTypeSlug, "NOT_BOOKABLE",
                        "This room type cannot be booked for the requested stay.")));
    }



    /**
     * The lowest nightly rate across the stay — doc 58 §3.2's {@code nightlyFrom}.
     *
     * <p>Ranked by {@link RateResolver#rank}, the same function the operator rate
     * grid uses, so a guest and an operator cannot be shown different winners.
     * Empty when any night of the stay has no price.
     */
    /**
     * One night's rate, under doc 56's full precedence.
     *
     * <h2>{@code rate_day} first</h2>
     *
     * A price typed for an exact date is the most specific statement anyone can
     * make about that night, so it is applied <em>on top of</em> the resolver's
     * answer rather than through it — the resolver ranks ranges, and a single
     * date is not a range. This mirrors {@code RateAuthoringService.grid}, which
     * has layered day prices the same way since V29.
     *
     * <p>Until STEP L this method consulted only {@code rate_rule} and the base
     * price, so a Partner could set a nightly price on the calendar, see it
     * there, and have the guest shown <strong>nothing at all</strong>: a room
     * type the guest path cannot price is dropped from availability entirely.
     * The operator surface and the guest surface were reading the same table and
     * disagreeing about what it meant.
     */
    private Optional<ResolvedRate> rateFor(UUID roomTypeId, Optional<BasePrice> base,
                                           LocalDate night) {
        return rates.dayPriceFor(roomTypeId, night)
                .map(day -> ResolvedRate.forDay(night, day.priceMinor(), day.currency()))
                .or(() -> RateResolver.rank(rates.candidatesFor(roomTypeId, night), base, night));
    }

    private Optional<Money> lowestNightly(UUID roomTypeId, BasePrice basePrice, LocalDate checkIn,
                                          LocalDate checkOut) {
        Optional<BasePrice> base = Optional.ofNullable(basePrice);
        long lowest = Long.MAX_VALUE;
        String currency = null;

        for (LocalDate night = checkIn; night.isBefore(checkOut); night = night.plusDays(1)) {
            Optional<ResolvedRate> rate = rateFor(roomTypeId, base, night);
            if (rate.isEmpty()) {
                return Optional.empty();
            }
            if (rate.get().amountMinor() < lowest) {
                lowest = rate.get().amountMinor();
                currency = rate.get().currency();
            }
        }
        if (currency == null) {
            return Optional.empty();
        }
        // VND is zero-decimal — doc 56 §6. The exponent travels with the amount so
        // no consumer has to know that, and a generic /100 cannot creep in.
        return Optional.of(new Money(lowest, currency, Money.VND.equals(currency) ? 0 : 2));
    }

    /**
     * The stay length in nights. Doc 55 §2 and doc 15 §3: "12 Sep → 14 Sep
     * occupies the nights of 12 Sep and 13 Sep. Two nights." The check-out night
     * is not occupied.
     */
    public static int nights(LocalDate checkIn, LocalDate checkOut) {
        return (int) ChronoUnit.DAYS.between(checkIn, checkOut);
    }

    private void requireUsableStay(LocalDate checkIn, LocalDate checkOut) {
        if (!checkOut.isAfter(checkIn)) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Check-out must be after check-in.",
                    List.of(new KasException.ErrorDetail("checkOut", "INVALID",
                            "A stay is at least one night.")));
        }
        if (checkIn.isBefore(LocalDate.now(clock))) {
            // Not a business rule about lead time — that is SAME_DAY_BOOKING_CUTOFF
            // (B20) and is unsupplied. This only refuses dates that have passed,
            // for which no inventory can meaningfully be sold.
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Check-in is in the past.",
                    List.of(new KasException.ErrorDetail("checkIn", "INVALID",
                            "Choose today or a later date.")));
        }
    }

    /**
     * Doc 58 §2.1 {@code 422 HORIZON_EXCEEDED}, applied only when the horizon is
     * actually known.
     *
     * <p>See the class comment for why a missing horizon does not fail the
     * request: it cannot make anything bookable that was not already bookable.
     */

}
