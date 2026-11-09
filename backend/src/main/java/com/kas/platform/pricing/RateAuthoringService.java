package com.kas.platform.pricing;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.BasePrice;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.property.RoomType;
import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.Money;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Rate authoring — doc 58 §8 and doc 56 §7.
 *
 * <h2>Scope</h2>
 *
 * <p>Ownership derives {@code rate_rule → room_type → property → partner}; no {@code partner_id} was
 * added to any rate table. Every read and every write carries the scope predicate inside its own
 * statement, so a cross-partner attempt matches no row and returns 404, never 403 (doc 85 §6.3).
 *
 * <h2>Bulk editing</h2>
 *
 * <p>The owner requires an extranet-style bulk editor: choose a property, several room types, a date
 * range, one rate. Doc 58 §8 already freezes the routes for it —
 * {@code POST /admin/rates/bulk-preview} and {@code /bulk-apply} — and doc 56 §7 makes the preview
 * mandatory.
 *
 * <p>There is no per-date rate table, so a bulk edit is expressed the way the frozen model expresses
 * everything else: <strong>one {@code rate_rule} per room type, carrying the date range</strong>. A
 * repeat of the same edit <em>updates</em> that rule rather than adding a second equally applicable
 * one — otherwise doc 56 §3.1's tie rule would refuse every correction after the first.
 *
 * <h2>All or nothing</h2>
 *
 * <p>{@link #bulkApply} validates every room type, date and value before it writes anything, and runs
 * in one transaction. If the fiftieth room type is out of scope, the first forty-nine are not
 * repriced. No partial-success contract was invented.
 *
 * <h2>What is not here</h2>
 *
 * <p>No tax. Tax is outside KAS V1 by owner decision (2026-08-18, doc 99 §12) and
 * {@code TaxIsOutOfScopeForV1Test} enforces its absence. No
 * voucher, no occupancy pricing, no extra-bed charge — doc 56 §3 layers 2 and 3, configs B10, B11 and
 * B23, all OPEN. No KAS price is seeded anywhere: config B6 is OPEN.
 */
@Service
public class RateAuthoringService {

    private static final String ENTITY = "rate_rule";

    /**
     * Bounds one request, not the business.
     *
     * <p>{@code MAX_RANGE_DAYS} matches the 24-month horizon (doc 55 §2), so a bulk edit can cover
     * everything that is sellable and no more. {@code MAX_GRID_CELLS} bounds a response rather than a
     * date range, because a grid's size is room types × dates and either alone says nothing about how
     * large the JSON will be. Neither is a commercial limit.
     */
    static final int MAX_RANGE_DAYS = 732;
    static final int MAX_GRID_CELLS = 5_000;

    private final RateRuleRepository rules;
    private final RoomTypeRepository roomTypes;
    private final PropertyRepository properties;
    private final RateDayRepository days;
    private final AuditLogger audit;

    public RateAuthoringService(RateRuleRepository rules, RoomTypeRepository roomTypes,
                                PropertyRepository properties, RateDayRepository days,
                                AuditLogger audit) {
        this.rules = rules;
        this.roomTypes = roomTypes;
        this.properties = properties;
        this.days = days;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ single rule

    public List<RateRule> list(UUID propertyId, AuthorizationScope scope) {
        requireProperty(propertyId, scope);
        return rules.findByProperty(propertyId, scope);
    }

    public RateRule require(UUID ruleId, AuthorizationScope scope) {
        return rules.findById(ruleId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Rate rule"));
    }

    /**
     * Creates a rule as {@code DRAFT} — doc 58 §8 {@code POST /admin/rate-rules}.
     *
     * <p>Refused if it would tie with an existing rule, which is where doc 56 §3.1 puts the guard:
     * "The admin rate editor blocks saving a rule that ties with an existing one on the same scope
     * and dates."
     */
    @Transactional
    public RateRule create(RateRule rule, ResolvedActor actor, AuthorizationScope scope) {
        UUID propertyId = resolveTargetProperty(rule, scope);
        requireExactlyOneOfPriceOrAdjustment(rule);
        requireOrderedDates(rule.dateFrom(), rule.dateTo());
        requireValidDaysOfWeek(rule.daysOfWeek());

        if (rules.tiesWithExisting(rule, scope)) {
            throw tie();
        }
        // The same guard, for the overlapping-but-not-identical ranges the SQL predicate cannot
        // express — see tieCreatedBy. One meaning of "tie" at all three write sites.
        equallyApplicable(rule, null, rules.findByProperty(propertyId, scope))
                .ifPresent(other -> {
                    throw overlappingTie(other, rule.priority());
                });

        UUID id = rules.create(rule, propertyId, actor.userId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        Map<String, Object> after = new HashMap<>();
        after.put("scope", rule.scope().name());
        after.put("priority", rule.priority());
        after.put("specificity", rule.specificity());
        record(actor, "rate.rule_created", id, after, scope);

        return require(id, scope);
    }

    /**
     * Edits a rule's commercial fields — doc 56 §7 "Create / <strong>edit</strong> rate rule".
     *
     * <p>Scope and dates are deliberately immutable. Changing them would move the rule to a different
     * position in the specificity ladder and could silently create a tie that
     * {@link #create}'s guard already refused; archiving and re-creating makes that visible, and doc
     * 56 §5.3 keeps the old rule readable so a price snapshot's {@code ruleId} still resolves.
     */
    @Transactional
    public RateRule update(UUID ruleId, String name, Long priceMinor, java.math.BigDecimal adjustment,
                           Integer minNights, Integer maxNights, ResolvedActor actor,
                           AuthorizationScope scope) {
        RateRule current = require(ruleId, scope);
        requireExactlyOneOf(priceMinor, adjustment);
        requireNonNegativePrice(priceMinor);

        rules.update(ruleId, name, priceMinor, adjustment, minNights, maxNights, scope);
        record(actor, "rate.rule_updated", ruleId,
                Map.of("from", describe(current), "priceMinor", String.valueOf(priceMinor)), scope);
        return require(ruleId, scope);
    }

    /** Doc 56 §5.3 — a rule is archived, never deleted, so snapshots keep resolving. */
    @Transactional
    public RateRule setStatus(UUID ruleId, RuleStatus target, ResolvedActor actor,
                              AuthorizationScope scope) {
        RateRule current = require(ruleId, scope);
        if (!current.status().canTransitionTo(target)) {
            throw ConflictException.illegalTransition(
                    "rateRuleStatus", current.status().name(), target.name());
        }
        // Activating into a tie is the second way an ambiguity can arise; the
        // first is creation, and doc 56 §3.1 refuses both.
        if (target == RuleStatus.ACTIVE && rules.tiesWithExisting(current, ruleId, scope)) {
            throw tie();
        }
        if (target == RuleStatus.ACTIVE) {
            equallyApplicable(current, ruleId,
                    rules.findByProperty(resolveTargetProperty(current, scope), scope))
                    .ifPresent(other -> {
                        throw overlappingTie(other, current.priority());
                    });
        }
        rules.setStatus(ruleId, target, scope);
        record(actor, "rate.rule_status_changed", ruleId,
                Map.of("from", current.status().name(), "to", target.name()), scope);
        return require(ruleId, scope);
    }

    // ----------------------------------------------------------------- base rate

    /**
     * Every room type of a property with its base rate — doc 56 §3's Layer 0.
     *
     * <p>Doc 56 §7 lists "Set base rate · {@code rate.manage} · Per room type" as a capability, and
     * doc 56 §9 config B6 names the same granularity: "Base rates per room type per property". The
     * column has existed since V5 and its comment says so — "Layer 0 of the pricing model (doc 56
     * §3)" — but nothing could write it, which is what made every date outside a rule's range
     * permanently unpriceable (OQ-147).
     *
     * <p>A room type with no base rate is returned with a <strong>null amount</strong>, not omitted
     * and not zeroed: an operator needs to see which rooms still have no fallback.
     */
    public List<BaseRate> baseRates(UUID propertyId, AuthorizationScope scope) {
        requireProperty(propertyId, scope);

        List<RoomType> types = roomTypes.findByProperty(propertyId, scope);
        Map<UUID, BasePrice> prices =
                roomTypes.findBaseRates(types.stream().map(RoomType::id).toList(), scope);

        return types.stream()
                .map(type -> {
                    BasePrice price = prices.get(type.id());
                    return new BaseRate(type.id(), type.slug(),
                            price == null ? null : price.amountMinor(),
                            price == null ? Money.VND : price.currency(),
                            type.version());
                })
                .toList();
    }

    /**
     * Sets — or clears — one room type's base rate.
     *
     * <p>{@code amountMinor} null clears it. Clearing is not the same as pricing at zero: doc 56 §9
     * keeps base rates OPEN, {@link RateResolver} treats an unpriced room type as
     * <strong>not sellable</strong> rather than free, and {@code room_type_price_nonneg} separately
     * permits a deliberate zero. Both operations are offered because both are real.
     *
     * <p>Concurrency follows {@code room_type}, whose row this is: compare-and-set on
     * {@code version}, {@code 409 VERSION_CONFLICT} on a stale one. No version is invented for
     * {@code rate_rule}, which has none.
     *
     * @throws NotFoundException  the room type is absent or outside the caller's scope — 404, never
     *                            403, so a foreign room type's existence is not disclosed
     * @throws ConflictException  {@code VERSION_CONFLICT} when someone else priced it first
     */
    @Transactional
    public BaseRate setBaseRate(UUID roomTypeId, Long amountMinor, int version, ResolvedActor actor,
                                AuthorizationScope scope) {
        RoomType current = roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));
        requireNonNegativePrice(amountMinor);

        if (!roomTypes.updateBasePrice(roomTypeId, amountMinor, version, scope)) {
            throw ConflictException.versionConflict("Room type " + current.slug());
        }

        Map<String, Object> after = new HashMap<>();
        after.put("roomTypeId", roomTypeId.toString());
        after.put("amountMinor", String.valueOf(amountMinor));
        record(actor, "rate.base_rate_set", roomTypeId, after, scope);

        return baseRateOf(roomTypeId, scope);
    }

    // -------------------------------------------------------------- day prices

    /**
     * Sets the price for one room type on one date.
     *
     * <p>The whole point of V29: this writes exactly one row and can therefore
     * not disturb a neighbouring date, which authoring a one-day rate rule could
     * never quite promise. It takes no version — a day price has no other
     * editor to conflict with, and the primary key resolves a genuine race.
     *
     * @throws NotFoundException when the room type is absent or out of scope
     */
    @Transactional
    public RateCell setDayPrice(UUID roomTypeId, LocalDate date, long amountMinor,
                                ResolvedActor actor, AuthorizationScope scope) {
        requireNonNegativePrice(amountMinor);

        RoomType type = roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));

        if (!days.upsert(roomTypeId, date, amountMinor, Money.VND, actor.userId(), scope)) {
            throw NotFoundException.outOfScope("Room type");
        }

        Map<String, Object> after = new HashMap<>();
        after.put("roomTypeId", roomTypeId.toString());
        after.put("date", date.toString());
        after.put("amountMinor", String.valueOf(amountMinor));
        record(actor, "rate.day_price_set", roomTypeId, after, scope);

        return RateCell.forDay(type.id(), date, amountMinor, Money.VND);
    }

    /**
     * Removes one date's price, so the cell falls back to a rule or the base.
     *
     * <p>Distinct from setting zero: zero is a price an operator chose, absence
     * is "whatever the standing price says".
     */
    @Transactional
    public RateCell clearDayPrice(UUID roomTypeId, LocalDate date, ResolvedActor actor,
                                  AuthorizationScope scope) {
        RoomType type = roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));

        if (days.clear(roomTypeId, date, scope)) {
            Map<String, Object> after = new HashMap<>();
            after.put("roomTypeId", roomTypeId.toString());
            after.put("date", date.toString());
            record(actor, "rate.day_price_cleared", roomTypeId, after, scope);
        }

        // The cell as it now resolves, so the caller can render the fallback
        // without a second round trip.
        Optional<BasePrice> base = roomTypes.findBasePrice(roomTypeId, scope);
        List<RateRule> candidates = rules.findActiveForRoomTypes(List.of(roomTypeId), scope)
                .stream().filter(rule -> appliesTo(rule, type, date)).toList();

        return RateResolver.rank(candidates, base, date)
                .map(rate -> RateCell.of(roomTypeId, rate))
                .orElseGet(() -> RateCell.empty(roomTypeId, date));
    }

    private BaseRate baseRateOf(UUID roomTypeId, AuthorizationScope scope) {
        RoomType type = roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));
        Optional<BasePrice> price = roomTypes.findBasePrice(roomTypeId, scope);
        return new BaseRate(type.id(), type.slug(),
                price.map(BasePrice::amountMinor).orElse(null),
                price.map(BasePrice::currency).orElse(Money.VND),
                type.version());
    }

    /**
     * One room type's fallback price.
     *
     * @param amountMinor null when none is set. A gap, never a zero — see {@link #setBaseRate}
     */
    public record BaseRate(UUID roomTypeId, String roomTypeSlug, Long amountMinor, String currency,
                           int version) {
    }

    // ---------------------------------------------------------------------- bulk

    /** Doc 58 §8 {@code POST /admin/rates/bulk-preview}. Writes nothing. */
    public BulkRateEffect bulkPreview(UUID propertyId, List<UUID> roomTypeIds, LocalDate from,
                                      LocalDate to, long amountMinor, int priority,
                                      AuthorizationScope scope) {
        return computeEffect(propertyId, roomTypeIds, from, to, amountMinor, priority, scope);
    }

    /**
     * Doc 58 §8 {@code POST /admin/rates/bulk-apply}.
     *
     * <p>Re-derives the effect under lock rather than trusting the preview the operator saw. A
     * preview is a snapshot; between it and the confirmation another operator may have archived a
     * rule or another partner's request may have been rejected. Doc 55 §7.1 applies the same rule to
     * inventory, and for the same reason.
     */
    @Transactional
    public BulkRateEffect bulkApply(UUID propertyId, List<UUID> roomTypeIds, LocalDate from,
                                    LocalDate to, long amountMinor, int priority, String name,
                                    ResolvedActor actor, AuthorizationScope scope) {
        // Deterministic lock order over the property's rules — rate_rule has no
        // version column, so concurrency is pessimistic, not optimistic.
        rules.lockPropertyRules(propertyId, scope);

        BulkRateEffect effect =
                computeEffect(propertyId, roomTypeIds, from, to, amountMinor, priority, scope);

        if (!effect.isApplicable()) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "This bulk rate change cannot be applied.",
                    effect.conflicts().stream()
                            .map(reason -> new KasException.ErrorDetail(
                                    "bulk", "BULK_RATE_CONFLICT", reason))
                            .toList());
        }

        for (BulkRateEffect.RoomTypeEffect target : effect.roomTypes()) {
            applyOne(propertyId, target, from, to, amountMinor, priority, name, actor, scope);
        }

        record(actor, "rate.bulk_applied", propertyId, Map.of(
                "from", from.toString(),
                "to", to.toString(),
                "roomTypes", effect.roomTypes().size(),
                "cellsAffected", effect.cellsAffected(),
                "amountMinor", amountMinor,
                "priority", priority), scope);

        return effect;
    }

    private void applyOne(UUID propertyId, BulkRateEffect.RoomTypeEffect target, LocalDate from,
                          LocalDate to, long amountMinor, int priority, String name,
                          ResolvedActor actor, AuthorizationScope scope) {
        Optional<RateRule> existing =
                rules.findByExactScope(target.roomTypeId(), from, to, null, priority, scope);

        if (existing.isPresent()) {
            rules.update(existing.get().id(), name, amountMinor, null, null, null, scope);
            return;
        }

        RateRule created = new RateRule(null, RateScope.ROOM_TYPE, null, target.roomTypeId(),
                name, priority, from, to, null, amountMinor, null, Money.VND,
                null, null, null, RuleStatus.ACTIVE);

        UUID id = rules.create(created, propertyId, actor.userId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));
        // A bulk edit is an operator saying "these dates cost this". Leaving the
        // rules DRAFT would mean the grid they just confirmed showed prices that
        // nothing was actually charging.
        rules.setStatus(id, RuleStatus.ACTIVE, scope);
    }

    // -------------------------------------------------------------------- grid

    /**
     * The resolved rate calendar — doc 58 §8 {@code GET /admin/rates/grid}, doc 56 §7 "Room types ×
     * dates, showing which rule won each cell".
     *
     * <p>One query for the rules, then ranking per cell in memory with {@link RateResolver#rank} —
     * the same function that prices a guest's stay, so the grid an operator checks and the price a
     * guest is quoted cannot disagree.
     */
    public Map<UUID, List<RateCell>> grid(UUID propertyId, LocalDate from, LocalDate to,
                                          AuthorizationScope scope) {
        requireProperty(propertyId, scope);
        requireOrderedDates(from, to);

        List<RoomType> types = roomTypes.findByProperty(propertyId, scope);
        int nights = (int) ChronoUnit.DAYS.between(from, to) + 1;
        requireGridFits(types.size(), nights);

        List<UUID> ids = types.stream().map(RoomType::id).toList();
        List<RateRule> active = rules.findActiveForRoomTypes(ids, scope);

        // One statement for every day price in the window (V29). A price typed
        // for an exact date is more specific than any range rule, so it is
        // applied on top of the resolver's answer rather than through it.
        Map<UUID, Map<LocalDate, RateDayRepository.DayPrice>> dayPrices =
                days.findForRoomTypes(ids, from, to, scope);

        Map<UUID, List<RateCell>> grid = new LinkedHashMap<>();
        for (RoomType type : types) {
            Optional<BasePrice> base = roomTypes.findBasePrice(type.id(), scope);
            Map<LocalDate, RateDayRepository.DayPrice> forType =
                    dayPrices.getOrDefault(type.id(), Map.of());
            List<RateCell> cells = new ArrayList<>();

            for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
                LocalDate on = date;

                RateDayRepository.DayPrice day = forType.get(on);
                if (day != null) {
                    cells.add(RateCell.forDay(type.id(), on, day.priceMinor(), day.currency()));
                    continue;
                }

                List<RateRule> candidates = active.stream()
                        .filter(rule -> appliesTo(rule, type, on))
                        .toList();
                cells.add(RateResolver.rank(candidates, base, on)
                        .map(rate -> RateCell.of(type.id(), rate))
                        .orElseGet(() -> RateCell.empty(type.id(), on)));
            }
            grid.put(type.id(), List.copyOf(cells));
        }
        return grid;
    }

    // ----------------------------------------------------------------- internals

    private BulkRateEffect computeEffect(UUID propertyId, List<UUID> roomTypeIds, LocalDate from,
                                         LocalDate to, long amountMinor, int priority,
                                         AuthorizationScope scope) {
        requireProperty(propertyId, scope);
        requireOrderedDates(from, to);
        requireRangeFits(from, to);
        requireNonNegativePrice(amountMinor);
        requireAtLeastOneRoomType(roomTypeIds);

        int nights = (int) ChronoUnit.DAYS.between(from, to) + 1;
        List<BulkRateEffect.RoomTypeEffect> effects = new ArrayList<>();
        List<String> conflicts = new ArrayList<>();

        List<RateRule> active = rules.findActiveForRoomTypes(roomTypeIds, scope);
        // Every rule of the property, whatever its status — the tie guard below has to see the
        // paused and drafted ones too, exactly as tiesWithExisting does at create and activation.
        List<RateRule> everyRule = rules.findByProperty(propertyId, scope);

        for (UUID roomTypeId : roomTypeIds) {
            // Every room type is resolved through the scoped repository, so one
            // belonging to another partner fails here and the whole request is
            // refused — never the other forty-nine applied and this one skipped.
            RoomType type = roomTypes.findById(roomTypeId, scope)
                    .orElseThrow(() -> NotFoundException.outOfScope("Room type"));

            if (!type.propertyId().equals(propertyId)) {
                conflicts.add(type.slug() + " does not belong to that property.");
                continue;
            }

            Optional<BasePrice> base = roomTypes.findBasePrice(roomTypeId, scope);
            Long lowest = null;
            Long highest = null;

            for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
                LocalDate on = date;
                Optional<ResolvedRate> current = RateResolver.rank(
                        active.stream().filter(rule -> appliesTo(rule, type, on)).toList(), base, on);
                if (current.isPresent()) {
                    long amount = current.get().amountMinor();
                    lowest = lowest == null ? amount : Math.min(lowest, amount);
                    highest = highest == null ? amount : Math.max(highest, amount);
                }
            }

            Optional<RateRule> repriced =
                    rules.findByExactScope(roomTypeId, from, to, null, priority, scope);
            BulkRateEffect.Action action = repriced.isPresent()
                    ? BulkRateEffect.Action.UPDATE
                    : BulkRateEffect.Action.CREATE;

            // OQ-148: the preview used to rank only the rules that already existed, so an edit
            // that would itself create a tie previewed clean, applied cleanly, and then made the
            // grid unpriceable on the overlap. The proposed rule is now part of the analysis.
            tieCreatedBy(roomTypeId, from, to, priority, repriced.map(RateRule::id).orElse(null),
                    everyRule)
                    .ifPresent(other -> conflicts.add(describeTie(type.slug(), other, priority,
                            from, to)));

            effects.add(new BulkRateEffect.RoomTypeEffect(roomTypeId, type.slug(), nights,
                    lowest, highest, amountMinor, action));
        }

        return new BulkRateEffect(from, to, nights, amountMinor, Money.VND,
                effects.size() * nights, effects, conflicts);
    }

    // ------------------------------------------------------------------ tie guard

    /**
     * The rule a proposed bulk edit would tie with, if any — OQ-148.
     *
     * <h2>What the exact-shape guard misses</h2>
     *
     * <p>{@link RateRuleRepository#tiesWithExisting} compares scope, dates and days-of-week with
     * {@code IS NOT DISTINCT FROM}, so it catches a rule of <em>identical</em> shape and nothing
     * else. But doc 56 §3.1 does not tie on shape — it ties on
     * {@code (priority, specificity)} <em>among the candidates applicable to one date</em>. Two
     * room-type rules at the same priority whose ranges merely <strong>overlap</strong> — 20–30 Aug
     * and 25–05 Sep, say — are both rank 4, both apply on 25–30 Aug, and
     * {@link RateResolver#rank} refuses every one of those dates. The old preview never saw it
     * coming, because it ranked the rules that existed rather than the rule about to be written.
     *
     * <h2>Why the dates are walked</h2>
     *
     * <p>Overlapping ranges alone are not a tie: two day-of-week rules can share a window and never
     * share a date, which {@code RateResolutionIT} relies on. So applicability is tested per date
     * with {@link RateRule#appliesOn} — the same predicate the resolver uses — and a tie is reported
     * only when a date genuinely exists on which both would apply.
     *
     * <p>Nothing is resolved, reordered or renumbered here. Doc 56 §3.1 keeps a tie a
     * <strong>configuration error</strong>; this only finds it one step earlier, before the operator
     * is shown an Apply button that would break their own calendar.
     *
     * @param excludeRuleId the rule this edit will reprice rather than duplicate, if there is one —
     *                      it necessarily overlaps itself
     */
    private static Optional<RateRule> tieCreatedBy(UUID roomTypeId, LocalDate from, LocalDate to,
                                                   int priority, UUID excludeRuleId,
                                                   List<RateRule> existing) {
        RateRule proposed = new RateRule(null, RateScope.ROOM_TYPE, null, roomTypeId, "", priority,
                from, to, null, 0L, null, Money.VND, null, null, null, RuleStatus.ACTIVE);
        return equallyApplicable(proposed, excludeRuleId, existing);
    }

    /** The first non-archived rule that would rank equal to {@code proposed} on a shared date. */
    private static Optional<RateRule> equallyApplicable(RateRule proposed, UUID excludeRuleId,
                                                        List<RateRule> existing) {
        return existing.stream()
                .filter(rule -> rule.status() != RuleStatus.ARCHIVED)
                .filter(RateRule::isV1Shape)
                .filter(rule -> !rule.id().equals(excludeRuleId))
                .filter(rule -> sameTarget(proposed, rule))
                .filter(rule -> rule.priority() == proposed.priority())
                .filter(rule -> rule.specificity() == proposed.specificity())
                .filter(rule -> sharesAnApplicableDate(proposed, rule))
                .findFirst();
    }

    private static boolean sameTarget(RateRule a, RateRule b) {
        return a.scope() == b.scope()
                && java.util.Objects.equals(a.roomTypeId(), b.roomTypeId())
                && java.util.Objects.equals(a.propertyId(), b.propertyId());
    }

    /**
     * Whether a date exists on which both rules apply.
     *
     * <p>The window is the intersection of the two ranges, clamped to {@link #MAX_RANGE_DAYS} — doc
     * 55 §2's 24-month horizon. Clamping costs nothing: a date beyond the horizon cannot be sold, so
     * a tie there cannot affect a sellable night. An unbounded pair is only reachable for rules with
     * no dates at all, whose identical shape {@code tiesWithExisting} already refuses.
     */
    private static boolean sharesAnApplicableDate(RateRule a, RateRule b) {
        LocalDate start = later(a.dateFrom(), b.dateFrom());
        if (start == null) {
            start = LocalDate.now();
        }
        LocalDate horizon = start.plusDays(MAX_RANGE_DAYS - 1L);

        LocalDate end = earlier(a.dateTo(), b.dateTo());
        if (end == null || end.isAfter(horizon)) {
            end = horizon;
        }
        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            if (a.appliesOn(date) && b.appliesOn(date)) {
                return true;
            }
        }
        return false;
    }

    private static LocalDate later(LocalDate a, LocalDate b) {
        if (a == null) {
            return b;
        }
        return b == null || a.isAfter(b) ? a : b;
    }

    private static LocalDate earlier(LocalDate a, LocalDate b) {
        if (a == null) {
            return b;
        }
        return b == null || a.isBefore(b) ? a : b;
    }

    private static String describeTie(String roomTypeSlug, RateRule other, int priority,
                                      LocalDate from, LocalDate to) {
        return roomTypeSlug + ": '" + other.name() + "' already applies at priority " + priority
                + " with the same specificity somewhere between " + from + " and " + to
                + ". Doc 56 §3.1 makes two equally applicable rules a configuration error, so this "
                + "edit would leave those dates unpriceable. Use a different priority or date range, "
                + "or archive the other rule first.";
    }

    /** The Java twin of the SQL candidate predicate — see {@link RateRule#appliesOn}. */
    private static boolean appliesTo(RateRule rule, RoomType type, LocalDate date) {
        boolean targetsType = type.id().equals(rule.roomTypeId())
                || (rule.roomTypeId() == null && type.propertyId().equals(rule.propertyId()));
        return targetsType && rule.isV1Shape() && rule.appliesOn(date);
    }

    private UUID resolveTargetProperty(RateRule rule, AuthorizationScope scope) {
        if (rule.scope() == RateScope.ROOM_TYPE) {
            return roomTypes.findById(rule.roomTypeId(), scope)
                    .orElseThrow(() -> NotFoundException.outOfScope("Room type"))
                    .propertyId();
        }
        requireProperty(rule.propertyId(), scope);
        return rule.propertyId();
    }

    private void requireProperty(UUID propertyId, AuthorizationScope scope) {
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * A tie that the exact-shape SQL predicate cannot see — two rules of equal rank whose ranges
     * merely overlap. Same error code as {@link #tie()}, because it is the same frozen rule.
     */
    private static BusinessRuleException overlappingTie(RateRule other, int priority) {
        return new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "An equally applicable rate rule already covers some of those dates.",
                List.of(new KasException.ErrorDetail("priority", "RATE_RULE_TIE",
                        "'" + other.name() + "' shares priority " + priority
                                + " and the same specificity on at least one overlapping date. Doc "
                                + "56 §3.1: a tie is a configuration error. Change the priority, "
                                + "the dates, or archive the other rule.")));
    }

    private static BusinessRuleException tie() {
        return new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "An equally applicable rate rule already exists.",
                List.of(new KasException.ErrorDetail("priority", "RATE_RULE_TIE",
                        "Doc 56 §3.1: a tie on (priority, specificity) is a configuration error. "
                                + "Change the priority, the scope or the dates.")));
    }

    private static void requireExactlyOneOfPriceOrAdjustment(RateRule rule) {
        requireExactlyOneOf(rule.priceMinor(), rule.adjustmentPercent());
        requireNonNegativePrice(rule.priceMinor());
    }

    private static void requireExactlyOneOf(Long priceMinor, java.math.BigDecimal adjustment) {
        if ((priceMinor == null) == (adjustment == null)) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "Provide exactly one of priceMinor or adjustmentPercent.",
                    List.of(new KasException.ErrorDetail("priceMinor", "INVALID",
                            "rate_rule_price_or_adjustment allows one, never both and never neither.")));
        }
    }

    private static void requireNonNegativePrice(Long priceMinor) {
        if (priceMinor != null && priceMinor < 0) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "A rate cannot be negative.");
        }
    }

    private static void requireOrderedDates(LocalDate from, LocalDate to) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "The end date is before the start date.");
        }
    }

    private static void requireRangeFits(LocalDate from, LocalDate to) {
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_RANGE_DAYS) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "That range covers more than " + MAX_RANGE_DAYS + " days. Split the edit.");
        }
    }

    private static void requireGridFits(int roomTypes, int nights) {
        if ((long) roomTypes * nights > MAX_GRID_CELLS) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "That grid would hold more than " + MAX_GRID_CELLS
                            + " cells. Request a shorter range.");
        }
    }

    private static void requireAtLeastOneRoomType(List<UUID> roomTypeIds) {
        if (roomTypeIds == null || roomTypeIds.isEmpty()) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "Select at least one room type.");
        }
    }

    private static void requireValidDaysOfWeek(List<Integer> daysOfWeek) {
        if (daysOfWeek == null) {
            return;
        }
        if (daysOfWeek.isEmpty() || daysOfWeek.size() > 7
                || daysOfWeek.stream().anyMatch(day -> day < 0 || day > 6)) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "daysOfWeek must hold between one and seven values in 0..6 (0 = Sunday).");
        }
    }

    private static String describe(RateRule rule) {
        return rule.name() + " @p" + rule.priority() + "/s" + rule.specificity();
    }

    private void record(ResolvedActor actor, String action, UUID entityId,
                        Map<String, Object> after, AuthorizationScope scope) {
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), action, ENTITY, entityId,
                null, after, null, null, null, CorrelationId.current(), scope.toString()));
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) {
            return UserRole.SUPER_ADMIN.name();
        }
        if (actor.roles().contains(UserRole.ADMIN)) {
            return UserRole.ADMIN.name();
        }
        return UserRole.CUSTOMER.name();
    }
}
