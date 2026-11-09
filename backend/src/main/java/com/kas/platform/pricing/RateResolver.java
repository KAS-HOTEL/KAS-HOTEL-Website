package com.kas.platform.pricing;

import com.kas.platform.property.BasePrice;
import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Doc 56 §3.1, implemented.
 *
 * <pre>
 * resolveNightlyRate(roomType, date, channelScope = DIRECT):
 *     candidates = rate_rule WHERE …
 *     if candidates empty: return roomType.base_price_minor
 *     winner = candidates ORDER BY priority DESC, specificity DESC LIMIT 1
 *     return winner.price_minor
 *         OR roomType.base_price_minor * (1 + winner.adjustment_percent/100)
 * </pre>
 *
 * <h2>Ties are refused, not resolved</h2>
 *
 * <p>Doc 56 §3.1: "Ties on {@code (priority, specificity)} are a
 * <strong>configuration error</strong>, not a coin flip." So when two candidates
 * share the top rank this throws rather than picking one. A resolver that
 * silently took the first row would be exactly the coin flip the contract
 * forbids, and the price would then depend on PostgreSQL's row order —
 * reproducible until the day it wasn't.
 *
 * <p>{@link RateRuleRepository#tiesWithExisting} stops most ties at write time,
 * which is where doc 56 §3.1 puts the guard. This is the second line: rows can
 * predate the guard, and a paused rule can be re-activated into a tie.
 *
 * <h2>No rate means not sellable</h2>
 *
 * <p>Every method returns {@link Optional#empty()} when no rule matches
 * <em>and</em> no base price is supplied. Doc 56 §3 calls Layer 0 "always
 * present", but the column is nullable, doc 56 §9 records base rates (config B6)
 * as <strong>OPEN</strong>, and no KAS rate exists anywhere. An unpriced room
 * type is therefore not sellable — never quoted at zero, never at a guess. Doc 56
 * §9 closes with "Until B6 and A7 are supplied, every displayed price is an
 * estimate and is labelled as one"; a price that does not exist is not an
 * estimate, it is an absence, and it fails closed.
 */
@Service
public class RateResolver {

    /**
     * VND is zero-decimal (doc 56 §6), so a percentage adjustment must land on a
     * whole minor unit — the rounding mode is visible arithmetic, not a
     * formatting detail.
     *
     * <p><strong>No frozen document states the rounding mode.</strong> HALF_UP is
     * used because it is conventional commercial rounding and because
     * {@code adjustment_percent} is a V1-unused shape (doc 56 §2 puts channel
     * rates and rate plans in FUTURE). Marked PROPOSED and registered as OQ-119
     * rather than presented as settled.
     */
    private static final RoundingMode ADJUSTMENT_ROUNDING = RoundingMode.HALF_UP;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /** Doc 56 §3.1 — {@code ORDER BY priority DESC, specificity DESC}. */
    private static final Comparator<RateRule> MOST_SPECIFIC_FIRST =
            Comparator.comparingInt(RateRule::priority)
                    .thenComparingInt(RateRule::specificity)
                    .reversed();

    private final RateRuleRepository rules;
    private final RoomTypeRepository roomTypes;

    public RateResolver(RateRuleRepository rules, RoomTypeRepository roomTypes) {
        this.rules = rules;
        this.roomTypes = roomTypes;
    }

    /**
     * The nightly rate for one room type on one date, or empty when the room type
     * has no price at all.
     *
     * @throws BusinessRuleException two rules tie on {@code (priority, specificity)}
     */
    public Optional<ResolvedRate> resolve(UUID roomTypeId, LocalDate date,
                                          AuthorizationScope scope) {
        return resolveWithBase(roomTypeId, roomTypes.findBasePrice(roomTypeId, scope), date, scope);
    }

    /**
     * The whole-stay rate for one room type, night by night.
     *
     * <p>Doc 55 §2 and doc 15 §3: nights are {@code checkIn … checkOut − 1}; the
     * check-out night is not occupied and is not charged.
     *
     * <p>Returns empty if <em>any</em> night has no price. A stay quoted with a
     * hole in it would be worse than no quote at all.
     */
    public Optional<List<ResolvedRate>> resolveStay(UUID roomTypeId, LocalDate checkIn,
                                                    LocalDate checkOut, AuthorizationScope scope) {
        // Read once for the whole stay rather than per night: the base price is a
        // property of the room type, not of the date.
        Optional<BasePrice> base = roomTypes.findBasePrice(roomTypeId, scope);

        List<ResolvedRate> nights = new ArrayList<>();
        for (LocalDate night = checkIn; night.isBefore(checkOut); night = night.plusDays(1)) {
            Optional<ResolvedRate> rate = resolveWithBase(roomTypeId, base, night, scope);
            if (rate.isEmpty()) {
                return Optional.empty();
            }
            nights.add(rate.get());
        }
        return nights.isEmpty() ? Optional.empty() : Optional.of(List.copyOf(nights));
    }

    /** The lowest nightly rate across a stay — doc 58 §3.2's {@code nightlyFrom}. */
    public Optional<ResolvedRate> lowestNightly(UUID roomTypeId, LocalDate checkIn,
                                                LocalDate checkOut, AuthorizationScope scope) {
        return resolveStay(roomTypeId, checkIn, checkOut, scope)
                .flatMap(nights -> nights.stream()
                        .min(Comparator.comparingLong(ResolvedRate::amountMinor)));
    }

    private Optional<ResolvedRate> resolveWithBase(UUID roomTypeId, Optional<BasePrice> base,
                                                   LocalDate date, AuthorizationScope scope) {
        return rank(rules.candidatesFor(roomTypeId, date, scope), base, date);
    }

    /**
     * Doc 56 §3.1's ranking, as a pure function.
     *
     * <p>Public and static on purpose. The guest-facing path cannot use
     * {@link RateRuleRepository} — that is a {@code ScopedRepository} and a guest
     * has no scope — so it reads candidates through
     * {@link PublishedRateRepository} instead and ranks them here. One
     * implementation of the winner rule, two ways of fetching the candidates: the
     * price a guest is quoted and the price an operator sees in the grid cannot
     * disagree.
     */
    public static Optional<ResolvedRate> rank(List<RateRule> candidates, Optional<BasePrice> base,
                                              LocalDate date) {
        if (candidates.isEmpty()) {
            return base.map(price ->
                    ResolvedRate.fromBase(date, price.amountMinor(), price.currency()));
        }

        List<RateRule> ranked = new ArrayList<>(candidates);
        ranked.sort(MOST_SPECIFIC_FIRST);

        RateRule winner = ranked.get(0);
        requireNoTie(ranked, winner, date);

        if (winner.priceMinor() != null) {
            return Optional.of(new ResolvedRate(date, winner.priceMinor(), winner.currency(),
                    winner.id(), winner.name()));
        }
        return adjustedBase(base, winner, date);
    }

    /**
     * Doc 56 §3.1: {@code base_price_minor * (1 + adjustment_percent/100)}.
     *
     * <p>An adjustment with no base to adjust resolves to nothing — never to the
     * adjustment applied to zero, which would quote a free room.
     */
    private static Optional<ResolvedRate> adjustedBase(Optional<BasePrice> base, RateRule winner,
                                                       LocalDate date) {
        if (base.isEmpty()) {
            return Optional.empty();
        }
        BasePrice price = base.get();
        BigDecimal adjusted = BigDecimal.valueOf(price.amountMinor())
                .multiply(BigDecimal.ONE.add(
                        winner.adjustmentPercent().divide(HUNDRED, 10, ADJUSTMENT_ROUNDING)))
                .setScale(0, ADJUSTMENT_ROUNDING);

        long amount = Math.max(adjusted.longValueExact(), 0L);
        return Optional.of(new ResolvedRate(date, amount, price.currency(),
                winner.id(), winner.name()));
    }

    private static void requireNoTie(List<RateRule> ranked, RateRule winner, LocalDate date) {
        if (ranked.size() < 2) {
            return;
        }
        RateRule runnerUp = ranked.get(1);
        if (runnerUp.priority() != winner.priority()
                || runnerUp.specificity() != winner.specificity()) {
            return;
        }
        throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "Two rate rules are equally applicable, so no price can be determined.",
                List.of(new KasException.ErrorDetail(date.toString(), "RATE_RULE_TIE",
                        "'" + winner.name() + "' and '" + runnerUp.name()
                                + "' share priority " + winner.priority()
                                + " and the same specificity. Change one before selling this date.")));
    }
}
