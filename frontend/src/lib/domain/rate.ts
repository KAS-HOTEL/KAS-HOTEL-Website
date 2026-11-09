/**
 * Rate types, mirroring `pricing.api.RateGridView`, `pricing.RateCell`,
 * `pricing.BulkRateEffect` and `pricing.api.RateRuleView` exactly.
 *
 * <h2>A gap is never a zero</h2>
 *
 * A cell has no price when no rule matched and no base price is set. Doc 56 §9
 * records base rates as OPEN, so an unpriced cell is a configuration gap, and
 * rendering it as `0` or "free" would be the worst possible reading of missing
 * data.
 *
 * <h2>Absent and null are the same gap</h2>
 *
 * The backend runs `spring.jackson.default-property-inclusion: non_null`, so a
 * null component is **omitted from the JSON entirely** — an unpriced cell arrives
 * as `{ roomTypeId, date }` with no `amountMinor` key at all. Every nullable
 * field below is therefore declared optional *and* nullable, and is read through
 * an accessor that folds both to `null`. Testing only `=== null` would let an
 * absent price fall through as if a rule had set it.
 *
 * <h2>No second pricing algorithm</h2>
 *
 * Nothing here resolves, ranks, defaults or carries a price forward.
 * `RateResolver` applies the frozen doc 56 §3.1 precedence (`priority DESC,
 * specificity DESC`) and treats a tie as a configuration error rather than a coin
 * flip. This module only formats what the backend already decided.
 *
 * **No tax anywhere.** Tax is out of scope for KAS V1 (owner decision, doc 99
 * §12) and the API returns none.
 */

/** Mirrors `pricing.RateCell`. */
export interface RateCell {
  readonly roomTypeId: string;
  /** ISO date. */
  readonly date: string;
  /**
   * Minor units. **Absent or null means unpriced** — a gap, never zero.
   * Read it through {@link cellAmount}.
   */
  readonly amountMinor?: number | null;
  /** Absent exactly when {@link amountMinor} is. */
  readonly currency?: string | null;
  /**
   * True when this exact date was priced by hand, through the calendar's cell
   * edit — a `rate_day` row (V29). Such a cell has no `ruleId`: nothing in the
   * rule list produced it, and it outranks every rule for that date.
   */
  readonly isDayPrice?: boolean;
  /**
   * The rule that won this cell, when a rule won it.
   *
   * Absent with a price present means the **base price** applied — no rule
   * matched, and `room_type.base_price_minor` was the fallback. That is a real
   * distinction an operator needs, not a missing value.
   *
   * On the doc 58 §9 INTERNAL denylist for guests. This is the operator surface,
   * so it is allowed here and must never be echoed onto a public one.
   */
  readonly ruleId?: string | null;
  /** Partner-authored free text. Rendered verbatim — never mapped to a category. */
  readonly ruleName?: string | null;
}

/** Mirrors `pricing.api.RateGridView`. */
export interface RateGridView {
  readonly propertyId: string;
  readonly from: string;
  readonly to: string;
  readonly rows: readonly RateGridRow[];
}

export interface RateGridRow {
  readonly roomTypeId: string;
  readonly cells: readonly RateCell[];
}

/** The price of a cell, or `null` when it has none. Absent and null are one gap. */
export function cellAmount(cell: RateCell | undefined): number | null {
  return cell?.amountMinor ?? null;
}

/** The currency a cell's price is in, or `null` when it is unpriced. */
export function cellCurrency(cell: RateCell | undefined): string | null {
  return cell?.currency ?? null;
}

/** The name of the rule that won a cell, or `null` when the base price won it. */
export function cellRuleName(cell: RateCell | undefined): string | null {
  return cell?.ruleName ?? null;
}

/**
 * Doc 55 §2 — the 24-month horizon, expressed as days by `RateAuthoringService`.
 * Mirrored for navigation UX only; the backend refuses a longer range with 422.
 */
export const MAX_RATE_RANGE_DAYS = 732;

/**
 * `RateAuthoringService.MAX_GRID_CELLS` — bounds a response rather than a
 * business rule. Room types × nights must not exceed it, so a wide range on a
 * property with many room types is split rather than refused at the server.
 */
export const MAX_GRID_CELLS = 5_000;

/**
 * The four states a rate cell can be in. `unpriced` is the default, not zero.
 *
 * `day` was added in STEP H: a price the operator typed for that exact date,
 * which outranks any rule.
 */
export type RateCellState = 'unpriced' | 'day' | 'ruled' | 'base';

/** What a cell's provenance is called on screen. */
export function rateCellProvenance(cell: RateCell | undefined): string {
  switch (rateCellState(cell)) {
    case 'unpriced':
      return 'chưa cấu hình giá';
    case 'day':
      return 'giá ngày';
    case 'base':
      return 'giá cơ bản';
    default:
      // The Partner's own rule name, verbatim: the API returns a name, not a
      // category, so mapping it to "Weekend" or "Season" would invent one.
      return cellRuleName(cell) ?? 'quy tắc';
  }
}

export function rateCellState(cell: RateCell | undefined): RateCellState {
  if (cellAmount(cell) === null) {
    return 'unpriced';
  }
  // A price typed for this exact date (V29) outranks every rule, so it is its
  // own provenance — reporting it as 'ruled' would send the reader to a rule
  // list that has nothing to show, and as 'base' would hide that it was set.
  if (cell?.isDayPrice === true) {
    return 'day';
  }
  return cellRuleName(cell) === null ? 'base' : 'ruled';
}

/**
 * Money, from minor units.
 *
 * VND has an exponent of 0, so minor units are whole dong — but the exponent is
 * not returned on this response, and assuming it for every currency would be
 * wrong the moment a second one appears. `Intl` is given the currency and decides
 * the fraction digits itself.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(currency === 'VND' ? amountMinor : amountMinor / 100);
}

/** The same number spoken out, for an accessible name. */
export function spokenMoney(amountMinor: number, currency: string): string {
  const amount = new Intl.NumberFormat('vi-VN').format(
    currency === 'VND' ? amountMinor : amountMinor / 100,
  );
  return currency === 'VND' ? `${amount} đồng` : `${amount} ${currency}`;
}

/** `roomTypeId|date` to the cell, for O(1) lookup while rendering a grid. */
export function indexRateCells(rows: readonly RateGridRow[]): ReadonlyMap<string, RateCell> {
  const index = new Map<string, RateCell>();
  for (const row of rows) {
    for (const cell of row.cells) {
      index.set(`${row.roomTypeId}|${cell.date}`, cell);
    }
  }
  return index;
}

/** How many cells in a grid actually carry a price. Never counts a gap. */
export function pricedCellCount(cells: Iterable<RateCell>): number {
  let priced = 0;
  for (const cell of cells) {
    if (cellAmount(cell) !== null) {
      priced += 1;
    }
  }
  return priced;
}

/**
 * The accessible name for one cell.
 *
 * Spelled out rather than left to colour or position: doc 82 forbids conveying
 * state by colour alone, and a screen-reader user moving through a grid has
 * neither the row header nor the column header in view. The winning rule is
 * included when there is one, because "why is this date different?" is the
 * question the grid exists to answer (doc 56 §7).
 */
export function rateCellLabel(
  roomName: string,
  date: string,
  cell: RateCell | undefined,
): string {
  const amount = cellAmount(cell);
  const currency = cellCurrency(cell);
  if (amount === null || currency === null) {
    return `${roomName} — ${date} — chưa cấu hình giá`;
  }
  const money = spokenMoney(amount, currency);
  if (cell?.isDayPrice === true) {
    return `${roomName} — ${date} — ${money} — giá ngày`;
  }
  const rule = cellRuleName(cell);
  return rule === null
    ? `${roomName} — ${date} — ${money} — giá cơ bản`
    : `${roomName} — ${date} — ${money} — quy tắc ${rule}`;
}

// ---------------------------------------------------------------- authoring

/**
 * Mirrors `pricing.api.BulkRateRequest` exactly — doc 58 §8
 * `POST /admin/rates/bulk-preview` and `/bulk-apply`.
 *
 * <h2>One operation, because the contract has one</h2>
 *
 * The frozen record carries a single `amountMinor`. There is **no operation
 * field, no percentage field and no delta field** on it, and
 * `RateAuthoringService.applyOne` always writes `price_minor = amountMinor` with
 * `adjustment_percent = null`. So the only bulk operation that exists is
 * *replace the price with this number*. "Increase by 10%" is not a supported
 * request that this module declines to send — it is a request the endpoint
 * cannot express, and inventing a shape for it would be inventing a contract.
 *
 * `adjustment_percent` does exist on a single `rate_rule`, and
 * `RateResolver.ADJUSTMENT_ROUNDING = HALF_UP` is still marked **PROPOSED**
 * (OQ-119). Percentage adjustment is therefore deferred here too, rather than
 * shipped on an unfrozen rounding rule.
 *
 * `priority` is on the contract on purpose: doc 56 §3.1 resolves on it, so an
 * operator laying a promotion over a season has to be able to say which wins.
 */
export interface BulkRateRequest {
  readonly propertyId: string;
  readonly roomTypeIds: readonly string[];
  /** ISO date, inclusive. */
  readonly dateFrom: string;
  /** ISO date, inclusive. */
  readonly dateTo: string;
  /** Minor units. VND is zero-decimal, so this is whole dong. */
  readonly amountMinor: number;
  /** Higher wins — doc 56 §3.1 orders `priority DESC`. */
  readonly priority: number;
  /** Optional; the backend substitutes `Bulk <from> to <to>` when blank. */
  readonly name?: string;
}

/** Doc 56 §5.3 — rules are never deleted, so a bulk edit only ever creates or updates. */
export type BulkRateAction = 'CREATE' | 'UPDATE';

/** Mirrors `pricing.BulkRateEffect.RoomTypeEffect`. */
export interface BulkRoomTypeEffect {
  readonly roomTypeId: string;
  readonly roomTypeSlug: string;
  readonly datesAffected: number;
  /**
   * The lowest / highest rate resolving across the range **today**, absent or
   * null when the room type has no price there at all.
   *
   * A range, not a per-date value: the response is per room type and carries no
   * per-cell rows. Presenting the low as "the current price" would invent a
   * precision the contract does not have.
   */
  readonly currentLowest?: number | null;
  readonly currentHighest?: number | null;
  readonly newAmountMinor: number;
  readonly action: BulkRateAction;
}

/** Mirrors `pricing.BulkRateEffect` — the preview response *and* the apply response. */
export interface BulkRateEffect {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly nights: number;
  readonly amountMinor: number;
  readonly currency: string;
  /** Room types × dates. The one figure the confirmation turns on. */
  readonly cellsAffected: number;
  readonly roomTypes: readonly BulkRoomTypeEffect[];
  /**
   * Reasons the apply would be refused. Backend-authored free text, rendered
   * verbatim. Non-empty means `bulk-apply` rejects the **whole** request.
   */
  readonly conflicts: readonly string[];
}

/** Mirrors `shared.RuleStatus` — `DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED`. */
export const RULE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

export type RuleStatus = (typeof RULE_STATUSES)[number];

/** Mirrors `pricing.RateScope`. */
export type RateScope = 'PROPERTY' | 'ROOM_TYPE';

/** Mirrors `pricing.api.RateRuleView`. Nullable fields arrive absent — see the module note. */
export interface RateRuleView {
  readonly id: string;
  readonly scope: RateScope | string;
  readonly propertyId?: string | null;
  readonly roomTypeId?: string | null;
  readonly name: string;
  /** Doc 56 §3.1's first ordering key. Stored. */
  readonly priority: number;
  /**
   * Doc 56 §3.1's second ordering key, **derived by the backend** from the
   * rule's shape. Displayed, never computed here — see the module note.
   */
  readonly specificity: number;
  readonly dateFrom?: string | null;
  readonly dateTo?: string | null;
  /** PostgreSQL `dow`: 0 = Sunday … 6 = Saturday. Absent means every day. */
  readonly daysOfWeek?: readonly number[] | null;
  readonly priceMinor?: number | null;
  /** On the contract; never written by this console — see OQ-119. */
  readonly adjustmentPercent?: number | null;
  readonly currency: string;
  readonly minNights?: number | null;
  readonly maxNights?: number | null;
  readonly status: RuleStatus | string;
}

/** Mirrors `pricing.api.RateRuleUpdateRequest`. Commercial fields only. */
export interface RateRuleUpdateRequest {
  readonly name?: string;
  /**
   * Always sent. `RateAuthoringService.update` calls `requireExactlyOneOf`, so a
   * PATCH carrying neither a price nor an adjustment is refused — a rename-only
   * edit has to restate the price.
   */
  readonly priceMinor: number;
}

export function isKnownRuleStatus(value: string): value is RuleStatus {
  return (RULE_STATUSES as readonly string[]).includes(value);
}

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang áp dụng',
  PAUSED: 'Tạm ngưng',
  ARCHIVED: 'Đã lưu trữ',
};

export function ruleStatusLabel(status: string): string {
  return isKnownRuleStatus(status) ? RULE_STATUS_LABELS[status] : status;
}

const RULE_STATUS_TONES: Record<RuleStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'danger',
};

export function ruleStatusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  return isKnownRuleStatus(status) ? RULE_STATUS_TONES[status] : 'neutral';
}

/**
 * The transitions the backend will accept — mirrors `RuleStatus.canTransitionTo`.
 *
 * A lifecycle, not a pricing decision: this decides which buttons to draw, and
 * the backend still refuses anything else with **409 `ILLEGAL_TRANSITION`**.
 * `ARCHIVED` is terminal, because doc 56 §5.3 keeps an archived rule readable so
 * a price snapshot's `ruleId` always resolves.
 */
const RULE_TRANSITIONS: Record<RuleStatus, readonly RuleStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function allowedRuleTransitions(status: string): readonly RuleStatus[] {
  return isKnownRuleStatus(status) ? RULE_TRANSITIONS[status] : [];
}

/** Verbs, so a transition control never reads the same as a status label. */
export const RULE_TRANSITION_LABELS: Record<RuleStatus, string> = {
  DRAFT: 'Chuyển về nháp',
  ACTIVE: 'Kích hoạt quy tắc',
  PAUSED: 'Tạm ngưng quy tắc',
  ARCHIVED: 'Lưu trữ quy tắc',
};

export function ruleTransitionLabel(status: RuleStatus): string {
  return RULE_TRANSITION_LABELS[status];
}

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** PostgreSQL `dow` rendered for a human. Absent is "every day", not "no day". */
export function weekdayLabel(daysOfWeek: readonly number[] | null | undefined): string {
  if (daysOfWeek === null || daysOfWeek === undefined || daysOfWeek.length === 0) {
    return 'Mọi ngày';
  }
  return daysOfWeek.map((day) => WEEKDAY_LABELS[day] ?? String(day)).join(', ');
}

/** A rule's date window. Either bound may be open — that is a real rule shape. */
export function ruleDateRange(rule: RateRuleView): string {
  const from = rule.dateFrom ?? null;
  const to = rule.dateTo ?? null;
  if (from === null && to === null) {
    return 'Không giới hạn';
  }
  return `${from ?? '…'} → ${to ?? '…'}`;
}

/**
 * What a bulk edit would change today, as a phrase.
 *
 * Built only from fields the effect actually carries. When a room type has no
 * price in the range the backend omits both bounds, and that renders as a gap —
 * never as `0`, and never as a price guessed from a neighbouring row.
 */
export function currentRangeLabel(effect: BulkRoomTypeEffect, currency: string): string {
  const lowest = effect.currentLowest ?? null;
  const highest = effect.currentHighest ?? null;
  if (lowest === null || highest === null) {
    return 'chưa cấu hình giá';
  }
  if (lowest === highest) {
    return formatMoney(lowest, currency);
  }
  return `${formatMoney(lowest, currency)} – ${formatMoney(highest, currency)}`;
}

/**
 * Doc 56 §5.3, as a phrase an operator can act on.
 *
 * `UPDATE` is the normal shape of a correction: repeating a bulk edit reprices
 * the rule already occupying that scope, dates and priority instead of adding a
 * second equally applicable one — which doc 56 §3.1 would then refuse to resolve.
 */
export function bulkActionLabel(action: BulkRateAction): string {
  return action === 'UPDATE' ? 'Cập nhật quy tắc hiện có' : 'Tạo quy tắc mới';
}

/**
 * The identity of a previewed edit.
 *
 * A preview describes one exact request. Change the rooms, the range, the
 * amount, the priority or the name and the preview on screen no longer describes
 * what apply would send — so it stops counting as a preview. Comparing
 * signatures rather than clearing state field by field means a field added later
 * cannot silently forget to invalidate.
 */
export function bulkRequestSignature(request: BulkRateRequest): string {
  return JSON.stringify({
    propertyId: request.propertyId,
    roomTypeIds: [...request.roomTypeIds].sort(),
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    amountMinor: request.amountMinor,
    priority: request.priority,
    name: request.name ?? '',
  });
}

/**
 * The one sentence a Partner confirms before a bulk apply.
 *
 * Every number comes from the **preview response**, never from the form: doc 56
 * §7 makes the preview mandatory because "applying a rate across 90 days without
 * seeing the result is how revenue accidents happen", and a confirmation quoting
 * the operator's own input back at them would defeat that.
 */
export function bulkConfirmSentence(effect: BulkRateEffect): string {
  return `Bạn sắp thay đổi giá cho ${effect.roomTypes.length} loại phòng trong ${effect.nights} ngày, tổng cộng ${effect.cellsAffected} ô.`;
}

/** The frozen all-or-nothing guarantee, stated in the operator's language. */
export const ALL_OR_NOTHING_NOTE = 'Thay đổi sẽ được áp dụng toàn bộ hoặc không áp dụng.';

// --------------------------------------------------------------- base rates

/**
 * Mirrors `pricing.api.BaseRateView` — doc 56 §3's Layer 0, per room type.
 *
 * <h2>A base rate is not a rule</h2>
 *
 * A rate rule is a **conditional override**: it carries dates, days of week, a
 * priority and a specificity, and it wins only where it applies. A base rate is
 * the **fallback** — what a night costs when no rule applies at all. Doc 56 §3.1
 * ends its specificity ladder at "base", below every rule, and doc 56 §3 calls it
 * Layer 0. They are different layers, not two names for one number.
 *
 * <h2>Absent is not zero</h2>
 *
 * `amountMinor` is absent when no base rate has been set — which is where every
 * room type starts, because doc 56 §9 keeps base rates (config B6) OPEN and no KAS
 * price is seeded anywhere. Zero is a different thing: a price a Partner may
 * deliberately set, which the `room_type_price_nonneg` CHECK permits. The two must
 * never collapse into one falsy value.
 *
 * `version` is **`room_type`'s** optimistic-concurrency token, because the base
 * rate is a column on that row. `rate_rule` has no version and none is invented.
 */
export interface BaseRateView {
  readonly roomTypeId: string;
  readonly roomTypeSlug: string;
  /** Minor units. Absent or null means **no base rate is set** — never zero. */
  readonly amountMinor?: number | null;
  readonly currency: string;
  readonly version: number;
}

/** Mirrors `pricing.api.BaseRateRequest`. A full replacement, not a patch. */
export interface BaseRateRequest {
  /**
   * Minor units, or `null` to **clear** the base rate.
   *
   * Clearing returns the room type to having no price at all, which `RateResolver`
   * treats as *not sellable* rather than free. It is a different operation from
   * setting zero and is offered as one.
   */
  readonly amountMinor: number | null;
  /** `room_type.version`. Required — doc 58 §2 puts `version` on MASTER updates. */
  readonly version: number;
}

/** The amount of a base rate, or `null` when none is set. Absent and null are one gap. */
export function baseRateAmount(rate: BaseRateView | undefined): number | null {
  return rate?.amountMinor ?? null;
}

/**
 * A base rate the backend would refuse, caught before the round trip.
 *
 * Mirrors `@Min(0)` on `BaseRateRequest.amountMinor` and the frozen
 * `room_type_price_nonneg` CHECK. It decides nothing commercial: there is no
 * suggested amount, no default and no upper bound, because doc 56 §9 keeps base
 * rates OPEN and a frontend that proposed a number would be inventing one.
 *
 * An empty string is **not** an error here — it is how the form expresses
 * "clear this rate", which is a real operation with its own confirmation.
 */
export function baseRateProblem(amount: string): string | null {
  if (amount.trim() === '') {
    return null;
  }
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 0) {
    return 'Giá phải là số nguyên không âm, tính bằng đồng.';
  }
  return null;
}

/** How a room type's base rate reads today. Words, never a colour alone. */
export function baseRateLabel(rate: BaseRateView): string {
  const amount = baseRateAmount(rate);
  return amount === null ? 'chưa cấu hình giá cơ bản' : formatMoney(amount, rate.currency);
}
