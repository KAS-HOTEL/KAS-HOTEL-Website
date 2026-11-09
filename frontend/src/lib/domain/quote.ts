import type { Money } from './availability';

/**
 * The guest quote, mirroring the frozen contract exactly — doc 58 §3.2's request
 * and doc 58 §11.2's response.
 *
 * <h2>Not the price snapshot</h2>
 *
 * This is **not** doc 56 §5.2's `price_snapshot`. That structure is internal and
 * persisted, and it carries `ruleId` and `appliedRuleIds` — both on the doc 58 §9
 * INTERNAL denylist. Nothing here identifies a rate rule, a priority, a
 * specificity, an inventory column, a database row or a partner.
 *
 * <h2>A quote creates nothing</h2>
 *
 * No reservation, no request, no snapshot, no hold, no payment — doc 58 §11.2.2.
 * The snapshot is written at `salesStatus = REQUESTED` by the reservation-request
 * flow, which is not built.
 *
 * **No tax, no voucher.** Tax is out of KAS V1 scope (doc 99 §12) and the
 * response carries no tax field, no service-charge field and no zero-tax line.
 */

/** Mirrors `inventory.api.QuoteRequest` — doc 58 §3.2, unchanged. */
export interface QuoteRequest {
  readonly propertySlug: string;
  readonly checkIn: string;
  /** Exclusive — the check-out night is neither occupied nor charged. */
  readonly checkOut: string;
  readonly adults: number;
  /**
   * **Always 0 in V1.** Config B10 (child pricing and age bands) is OPEN, so a
   * request with children is refused rather than priced — doc 58 §11.2.3. The UI
   * therefore offers no child control at all.
   */
  readonly children: number;
  /** Always empty in V1, for the same reason. */
  readonly childAges: readonly number[];
  readonly lines: readonly QuoteRequestLine[];
  /**
   * **Never sent in V1.** Config B23 (voucher rules) is OPEN, so a supplied code
   * is refused rather than silently ignored — and offering a field that can only
   * produce a refusal would be worse than not offering one.
   */
  readonly offerCode?: string;
}

export interface QuoteRequestLine {
  readonly roomTypeSlug: string;
  readonly quantity: number;
}

/** Mirrors `inventory.api.QuoteView` — doc 58 §11.2.1, field for field. */
export interface Quote {
  readonly propertySlug: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly lines: readonly QuoteLine[];
  readonly roomsSubtotal: Money;
  /** The room-rate total. V1 has no tax step and no voucher step. */
  readonly total: Money;
  readonly currency: string;
  /**
   * Always `true`. A quote is a calculation taken **before** submission; the
   * price a guest can hold KAS to is the snapshot written at `REQUESTED`.
   */
  readonly estimate: boolean;
}

export interface QuoteLine {
  readonly roomTypeSlug: string;
  readonly roomTypeName: string;
  readonly quantity: number;
  /**
   * The **lowest** nightly rate for this room type across the stay — a display
   * price. When a rule varies the rate across nights, `subtotal` is *not*
   * `nightlyFrom × nights × quantity`; `subtotal` is the real arithmetic of doc
   * 56 §3.2.
   */
  readonly nightlyFrom: Money;
  readonly subtotal: Money;
}

/** How many rooms a guest has selected in total. */
export function selectedRoomCount(selection: Readonly<Record<string, number>>): number {
  return Object.values(selection).reduce((sum, quantity) => sum + quantity, 0);
}

/**
 * The lines to send, dropping anything set to zero.
 *
 * One line per room type — the backend refuses a duplicated room type with 400,
 * because two lines for one type would double-count against inventory.
 */
export function quoteLines(
  selection: Readonly<Record<string, number>>,
): readonly QuoteRequestLine[] {
  return Object.entries(selection)
    .filter(([, quantity]) => quantity > 0)
    .map(([roomTypeSlug, quantity]) => ({ roomTypeSlug, quantity }));
}

/**
 * A quote request the backend would refuse, caught before the round trip.
 *
 * Mirrors only what the frozen contract states: at least one line, at least one
 * adult. **No child rule and no capacity arithmetic is duplicated here** — B10
 * and B11 are OPEN, the backend owns both refusals, and a second implementation
 * could disagree with it.
 */
export function quoteProblem(
  selection: Readonly<Record<string, number>>,
  adults: number,
  copy: QuoteProblemCopy,
): string | null {
  if (selectedRoomCount(selection) === 0) {
    return copy.atLeastOneRoom;
  }
  if (!Number.isInteger(adults) || adults < 1) {
    return copy.adultsRequired;
  }
  return null;
}

/** The two strings {@link quoteProblem} returns, in the reader's language. */
export interface QuoteProblemCopy {
  readonly atLeastOneRoom: string;
  readonly adultsRequired: string;
}
