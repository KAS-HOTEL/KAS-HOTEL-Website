import { api } from '../client';
import type {
  BaseRateRequest,
  BaseRateView,
  BulkRateEffect,
  BulkRateRequest,
  RateCell,
  RateGridView,
  RateRuleUpdateRequest,
  RateRuleView,
  RuleStatus,
} from '@/lib/domain/rate';

/**
 * Rate endpoints — verified against `pricing.api.AdminRateController`.
 *
 * <h2>Which permission each one needs</h2>
 *
 * Doc 56 §7 splits `rate.view` from `rate.manage` so a revenue analyst can read
 * the grid without being able to move it. `grid` and `rules` need only the
 * former; every write below needs the latter. The Partner's ADMIN role holds
 * both (doc 59 §4.4), scoped to its own partner.
 *
 * <h2>What is deliberately not here</h2>
 *
 * `POST /admin/rate-rules` — standalone rule creation. It exists on the backend
 * and is not wrapped: the bulk editor already creates the dated room-type rules
 * the owner's workflow needs, and the extra fields a from-scratch form would
 * open (`adjustmentPercent`, `daysOfWeek`, `minNights`/`maxNights`, `PROPERTY`
 * scope) each carry an unresolved question — OQ-119 for the first, OQ-120 for
 * the third. Doc 56 §7's "create rate rule" capability is met through
 * `bulkApply`; the richer editor is deferred, not forgotten.
 */

export const ratesApi = {
  /**
   * `GET /api/v1/admin/rates/grid?propertyId=&from=&to=` — permission `rate.view`.
   *
   * Room types down, dates across, already resolved by `RateResolver` under the
   * frozen doc 56 §3.1 precedence. Each cell carries the **winning rule's id and
   * name**, because a grid that shows only the price cannot answer "why is this
   * date different?".
   *
   * `amountMinor` is `null` where nothing priced the cell — a gap, never zero.
   *
   * Refuses with **422** a range over 732 days (doc 55 §2's 24-month horizon) or a
   * grid over 5000 cells, and **404** for a property outside the caller's scope.
   */
  grid: (propertyId: string, from: string, to: string, cookieHeader?: string) =>
    api.get<RateGridView>('/api/v1/admin/rates/grid', {
      query: { propertyId, from, to },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /**
   * `PUT /api/v1/admin/rates/day/{roomTypeId}/{date}` — permission `rate.manage`.
   *
   * The calendar's cell edit: one room type, one date, one price. It writes a
   * single `rate_day` row, so it cannot disturb a neighbouring date — which is
   * why this exists rather than the caller authoring a one-day rate rule.
   *
   * A day price outranks every rate rule for that date. Answers with the cell as
   * it now stands, so the calendar can paint the result without re-reading the
   * whole grid.
   *
   * `amountMinor` of `0` is a real price — a complimentary night — and is kept
   * as one. To remove a price entirely, use {@link clearDayPrice}.
   *
   * **404, never 403**, for a room type outside the caller's scope.
   */
  setDayPrice: (roomTypeId: string, date: string, amountMinor: number) =>
    api.put<RateCell>(
      `/api/v1/admin/rates/day/${encodeURIComponent(roomTypeId)}/${encodeURIComponent(date)}`,
      { amountMinor },
    ),

  /**
   * `DELETE /api/v1/admin/rates/day/{roomTypeId}/{date}` — permission `rate.manage`.
   *
   * Removes one date's hand-set price so the cell falls back to whichever rate
   * rule or base price applies. Distinct from setting zero: zero is a price
   * somebody chose, absence is "whatever the standing price says".
   *
   * Clearing a date that had no day price is not an error — the end state is the
   * one asked for either way. Answers with the cell as it now resolves.
   */
  clearDayPrice: (roomTypeId: string, date: string) =>
    api.delete<RateCell>(
      `/api/v1/admin/rates/day/${encodeURIComponent(roomTypeId)}/${encodeURIComponent(date)}`,
    ),

  /**
   * `GET /api/v1/admin/rates/base?propertyId=` — permission `rate.view`.
   *
   * Every room type's **fallback** price — doc 56 §3's Layer 0, the number that
   * applies when no rate rule does. `amountMinor` is absent where none is set,
   * which is where every room type starts: doc 56 §9 keeps base rates (config B6)
   * OPEN and nothing seeds a value.
   *
   * `version` is `room_type`'s own concurrency token, because the base rate is a
   * column on that row.
   */
  baseRates: (propertyId: string, cookieHeader?: string) =>
    api.get<BaseRateView[]>('/api/v1/admin/rates/base', {
      query: { propertyId },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /**
   * `PUT /api/v1/admin/rates/base/{roomTypeId}` — permission `rate.manage`.
   *
   * Sets or clears one room type's base rate. **One room type per call** — the
   * backend defines no bulk base-rate operation, and looping this endpoint to
   * simulate one would be inventing a workflow the contract does not have
   * (OQ-150).
   *
   * `amountMinor: null` **clears** the rate rather than zeroing it: an unpriced
   * room type is not sellable, while a deliberate zero is a price the schema
   * permits.
   *
   * Refuses **400** for a negative amount or a missing `version`, **409
   * `VERSION_CONFLICT`** when someone else priced it first, and **404** for a room
   * type outside the caller's scope.
   */
  setBaseRate: (roomTypeId: string, body: BaseRateRequest) =>
    api.put<BaseRateView>(
      `/api/v1/admin/rates/base/${encodeURIComponent(roomTypeId)}`,
      body,
    ),

  /**
   * `POST /api/v1/admin/rates/bulk-preview` — permission `rate.manage`.
   *
   * **Writes nothing.** Doc 56 §7 makes this step mandatory before a commit:
   * "Applying a rate across 90 days without seeing the result is how revenue
   * accidents happen."
   *
   * Returns the same `BulkRateEffect` shape `bulkApply` returns, so the figures
   * an operator confirms are the figures the apply reports back.
   *
   * Refuses **400** for an empty `roomTypeIds` or a negative `amountMinor`,
   * **422** for an inverted or over-long range, and **404** for a property or
   * room type outside the caller's scope.
   */
  bulkPreview: (body: BulkRateRequest) =>
    api.post<BulkRateEffect>('/api/v1/admin/rates/bulk-preview', body),

  /**
   * `POST /api/v1/admin/rates/bulk-apply` — permission `rate.manage`.
   *
   * **All or nothing.** Every room type, date and value is validated before
   * anything is written, inside one transaction: if the fiftieth room type is out
   * of scope, the first forty-nine are not repriced. There is no partial-success
   * shape on this contract and the client must never manufacture one.
   *
   * The effect is **re-derived under a pessimistic lock** rather than taken from
   * the preview the operator saw — `rate_rule` has no `version` column, so there
   * is no optimistic token to send. A preview is a snapshot; the response is what
   * actually happened, and it is the response that should be displayed.
   *
   * Repeating the same edit **reprices the existing rule** instead of adding a
   * second equally applicable one, which doc 56 §3.1 would then refuse to
   * resolve. That shows up as `action: 'UPDATE'` on the preview.
   */
  bulkApply: (body: BulkRateRequest) =>
    api.post<BulkRateEffect>('/api/v1/admin/rates/bulk-apply', body),

  /**
   * `GET /api/v1/admin/rate-rules?propertyId=` — permission `rate.view`.
   *
   * Ordered `priority DESC, date_from, name` by the repository. Carries
   * `priority` and the backend-derived `specificity`, which are exactly doc 56
   * §3.1's two ordering keys — so an operator asking "why did that rule win?" can
   * read the answer instead of guessing at it.
   */
  rules: (propertyId: string, cookieHeader?: string) =>
    api.get<RateRuleView[]>('/api/v1/admin/rate-rules', {
      query: { propertyId },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /**
   * `PATCH /api/v1/admin/rate-rules/{ruleId}` — permission `rate.manage`.
   *
   * Commercial fields only. Scope, dates and days-of-week are immutable by
   * design: changing them would move the rule to a different rung of doc 56
   * §3.1's specificity ladder and could create a tie the create-time guard
   * already refused.
   */
  updateRule: (ruleId: string, body: RateRuleUpdateRequest) =>
    api.patch<RateRuleView>(`/api/v1/admin/rate-rules/${encodeURIComponent(ruleId)}`, body),

  /**
   * `PATCH /api/v1/admin/rate-rules/{ruleId}/status?status=` — permission `rate.manage`.
   *
   * `DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED`, with `ARCHIVED` terminal. Doc 56 §5.3:
   * a rule is archived, **never deleted**, so a price snapshot's `ruleId` always
   * resolves. An illegal transition is **409 `ILLEGAL_TRANSITION`**.
   *
   * Activating into a tie is refused **422** with `RATE_RULE_TIE` in `details[]`
   * — doc 56 §3.1 treats a tie on `(priority, specificity)` as a configuration
   * error, not a coin flip.
   */
  setRuleStatus: (ruleId: string, status: RuleStatus) =>
    api.patch<RateRuleView>(
      `/api/v1/admin/rate-rules/${encodeURIComponent(ruleId)}/status?status=${status}`,
    ),
} as const;
