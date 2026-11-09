package com.kas.platform.pricing.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.pricing.BulkRateEffect;
import com.kas.platform.pricing.RateAuthoringService;
import com.kas.platform.pricing.RateCell;
import com.kas.platform.pricing.RateRule;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.Money;
import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Central Rate Management — doc 58 §8, at its frozen paths.
 *
 * <table>
 *   <caption>Doc 58 §8, transcribed</caption>
 *   <tr><td>GET</td><td>{@code /admin/rates/grid}</td><td>{@code rate.view}</td>
 *       <td>doc 56 §7: "Room types × dates, showing which rule won each cell"</td></tr>
 *   <tr><td>POST</td><td>{@code /admin/rate-rules}</td><td>{@code rate.manage}</td>
 *       <td>create</td></tr>
 *   <tr><td>POST</td><td>{@code /admin/rates/bulk-preview}</td><td>{@code rate.manage}</td>
 *       <td>doc 56 §7: <strong>mandatory</strong> before commit</td></tr>
 *   <tr><td>POST</td><td>{@code /admin/rates/bulk-apply}</td><td>{@code rate.manage}</td>
 *       <td>bulk update</td></tr>
 * </table>
 *
 * <p><strong>Both permissions already existed.</strong> {@code rate.view} and {@code rate.manage} are
 * doc 59 §4.4, in the catalogue since Phase 7.3, and the V1 {@code ADMIN} — which holds
 * {@code PARTNER} scope (doc 85 §5.2) — carries both. Nothing was invented, and the Partner can
 * author rates for its own properties and only those.
 *
 * <h2>Two routes are additions — OQ-128</h2>
 *
 * <p>Doc 58 §8 names creation but no route for <em>edit</em> or <em>archive</em>, while doc 56 §7
 * lists both as capabilities ("Create / edit rate rule", "Archive a rule — never delete"). The
 * capability is frozen; the path is not. {@code PATCH /admin/rate-rules/{id}} and
 * {@code PATCH /admin/rate-rules/{id}/status} sit inside the existing namespace rather than opening a
 * new one, the same shape doc 93 §7 and doc 95 §10 used. <strong>This needs a doc 58 amendment.</strong>
 *
 * <p>There is no DELETE, by frozen rule: doc 56 §5.3 — "Rate rules are never deleted, only
 * {@code status = ARCHIVED}, so a snapshot's {@code ruleId} always resolves."
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminRateController {

    private final RateAuthoringService rates;

    public AdminRateController(RateAuthoringService rates) {
        this.rates = rates;
    }

    // ------------------------------------------------------------------- the grid

    /**
     * The resolved rate calendar — room types down, dates across.
     *
     * <p>{@code rate.view} rather than {@code rate.manage}: doc 56 §7 separates viewing the grid from
     * changing it, so a revenue analyst can read prices without being able to move them.
     */
    @GetMapping("/rates/grid")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_VIEW + "')")
    public RateGridView grid(
            @RequestParam UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        Map<UUID, List<RateCell>> grid = rates.grid(propertyId, from, to,
                CurrentActor.requireScope());
        return RateGridView.of(propertyId, from, to, grid);
    }

    // ------------------------------------------------------------------ base rate

    /**
     * Every room type's fallback price — doc 56 §3's Layer 0.
     *
     * <p>{@code rate.view}, matching the grid: reading what a room costs when no rule applies is
     * reading, not changing.
     *
     * <p>{@code amountMinor} is <strong>null where no base rate has been set</strong>, which is
     * every room type until a Partner sets one. Doc 56 §9 keeps base rates (config B6) OPEN and
     * nothing seeds a number.
     */
    @GetMapping("/rates/base")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_VIEW + "')")
    public List<BaseRateView> baseRates(@RequestParam UUID propertyId) {
        return rates.baseRates(propertyId, CurrentActor.requireScope()).stream()
                .map(rate -> new BaseRateView(rate.roomTypeId(), rate.roomTypeSlug(),
                        rate.amountMinor(), rate.currency(), rate.version()))
                .toList();
    }

    /**
     * Sets or clears one room type's base rate — doc 56 §7 "Set base rate · Per room type".
     *
     * <h2>This route is an addition — OQ-147</h2>
     *
     * <p>Doc 56 §7 lists the capability as CONFIRMED and doc 56 §9 config B6 names the same
     * granularity, "Base rates per room type per property". The storage has been authoritative since
     * V5 — {@code room_type.base_price_minor}, whose column comment reads "Layer 0 of the pricing
     * model (doc 56 §3)". What did not exist was any way to write it, so a Partner could price the
     * dates a rule covered and never the ones it did not. <strong>The capability is frozen; the path
     * is not</strong>, so it sits inside the existing {@code /admin/rates} namespace rather than
     * opening a new one — the same shape doc 93 §7 and doc 95 §10 used, and the same situation as
     * OQ-128. <strong>This needs a doc 58 amendment.</strong>
     *
     * <p>{@code PUT} rather than {@code PATCH} because it replaces the whole value: an absent or
     * null {@code amountMinor} <strong>clears</strong> the base rate. Clearing is not zeroing —
     * {@link com.kas.platform.pricing.RateResolver} treats an unpriced room type as not sellable
     * rather than free, while a deliberate zero is a price the schema permits.
     *
     * <p>No number originates here. Doc 56 §9 B6 remains OPEN; this supplies the mechanism, not the
     * values.
     */
    @PutMapping("/rates/base/{roomTypeId}")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public BaseRateView setBaseRate(@PathVariable UUID roomTypeId,
                                    @Valid @RequestBody BaseRateRequest request) {
        RateAuthoringService.BaseRate rate = rates.setBaseRate(roomTypeId, request.amountMinor(),
                request.version(), CurrentActor.require().actor(), CurrentActor.requireScope());

        return new BaseRateView(rate.roomTypeId(), rate.roomTypeSlug(), rate.amountMinor(),
                rate.currency(), rate.version());
    }

    // ------------------------------------------------------------------ day price

    /**
     * Sets the price for one room type on one date — the rate calendar's cell edit.
     *
     * <p>This is the fast path the extranet is built around: one click, one
     * number, one row. It writes {@code rate_day} (V29) and touches no other
     * date, which authoring a one-day rate rule could not promise.
     *
     * <p>A day price outranks every rate rule for that date. Rules keep their
     * meaning for seasons and campaigns; this is the operator overriding one
     * square of the calendar, and the more specific answer wins.
     *
     * <p>Refusals: {@code 404} when the room type is absent or belongs to another
     * partner, {@code 400} for a negative amount.
     */
    @PutMapping("/rates/day/{roomTypeId}/{date}")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public RateCell setDayPrice(
            @PathVariable UUID roomTypeId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @Valid @RequestBody DayPriceRequest request) {

        return rates.setDayPrice(roomTypeId, date, request.amountMinor(),
                CurrentActor.require().actor(), CurrentActor.requireScope());
    }

    /**
     * Removes one date's price, so the cell falls back to a rule or the base rate.
     *
     * <p>Answers with the cell as it now resolves, so the calendar can render the
     * fallback without a second request. Deleting a price that was not set is not
     * an error — the end state is the one asked for either way.
     */
    @DeleteMapping("/rates/day/{roomTypeId}/{date}")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public RateCell clearDayPrice(
            @PathVariable UUID roomTypeId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {

        return rates.clearDayPrice(roomTypeId, date,
                CurrentActor.require().actor(), CurrentActor.requireScope());
    }

    // ------------------------------------------------------------------ bulk edit

    /** Writes nothing. Doc 56 §7 makes this step mandatory before {@link #bulkApply}. */
    @PostMapping("/rates/bulk-preview")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public BulkRateEffect bulkPreview(@Valid @RequestBody BulkRateRequest request) {
        return rates.bulkPreview(request.propertyId(), request.roomTypeIds(), request.dateFrom(),
                request.dateTo(), request.amountMinor(), request.priority(),
                CurrentActor.requireScope());
    }

    /**
     * Applies the edit to every selected room type across the range, or to none of them.
     *
     * <p>Re-derives the effect under lock rather than trusting the previewed figures — the operator's
     * screen is a snapshot, and doc 55 §7.1 applies the same rule to inventory.
     */
    @PostMapping("/rates/bulk-apply")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public BulkRateEffect bulkApply(@Valid @RequestBody BulkRateRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return rates.bulkApply(request.propertyId(), request.roomTypeIds(), request.dateFrom(),
                request.dateTo(), request.amountMinor(), request.priority(),
                request.nameOrDefault(), CurrentActor.require().actor(), scope);
    }

    // ---------------------------------------------------------------- single rule

    @GetMapping("/rate-rules")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_VIEW + "')")
    public List<RateRuleView> list(@RequestParam UUID propertyId) {
        return rates.list(propertyId, CurrentActor.requireScope()).stream()
                .map(RateRuleView::of)
                .toList();
    }

    @PostMapping("/rate-rules")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public RateRuleView create(@Valid @RequestBody RateRuleRequest request) {
        RateRule rule = new RateRule(
                null, request.scope(), request.propertyId(), request.roomTypeId(), request.name(),
                request.priority(), request.dateFrom(), request.dateTo(), request.daysOfWeek(),
                request.priceMinor(), request.adjustmentPercent(), Money.VND,
                request.minNights(), request.maxNights(), null, RuleStatus.DRAFT);

        return RateRuleView.of(
                rates.create(rule, CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Commercial fields only — scope and dates are immutable. See {@code RateAuthoringService}. */
    @PatchMapping("/rate-rules/{ruleId}")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public RateRuleView update(@PathVariable UUID ruleId,
                               @Valid @RequestBody RateRuleUpdateRequest request) {
        return RateRuleView.of(rates.update(ruleId, request.name(), request.priceMinor(),
                request.adjustmentPercent(), request.minNights(), request.maxNights(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    @PatchMapping("/rate-rules/{ruleId}/status")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public RateRuleView setStatus(@PathVariable UUID ruleId, @RequestParam RuleStatus status) {
        return RateRuleView.of(rates.setStatus(ruleId, status,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

}
