export interface GuestReview {
  id: string; hotelKey: string; rating: number; title?: string; body: string;
  language: string; stayMonth?: string; status: string;
  hiddenAt?: string | null; deletedAt?: string | null; publishedAt?: string | null;
  /** Tracing: the hotel, booking and customer the review belongs to. `guestName` is the name on the booking. */
  hotelName?: string | null; bookingReference?: string | null; customerName?: string | null;
  customerCode?: string | null; guestName?: string | null; submittedAt?: string | null;
}
export type ReviewAction = 'APPROVE' | 'REJECT' | 'HIDE' | 'SHOW' | 'DELETE';
export interface Voucher {
  id: string; code: string; name: string; description?: string; type: string;
  valuePercent?: number | null; valueMinor?: number | null; valueAddDescription?: string;
  currency: string; validFrom?: string; validTo?: string; stayFrom?: string; stayTo?: string;
  minNights?: number | null; minTotalMinor?: number | null; usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null; usedCount: number; stackable: boolean; status: string;
  /** What staff see: `status`, or `EXPIRED` past the last valid day / `USED_UP` when every use is spent. */
  displayStatus?: string;
  /** Hotels the voucher applies to; empty means every hotel. */
  properties?: readonly { slug: string; name: string }[];
  /** When it was created, and its real start / end (2026-11-14; absent on older vouchers). */
  createdAt?: string; validFromAt?: string | null; validToAt?: string | null;
  /** ALL, TIERS (member tiers) or CUSTOMERS (chosen accounts). */
  audience?: VoucherAudience;
  tiers?: readonly VoucherTier[];
  customers?: readonly VoucherCustomer[];
}
export type VoucherAudience = 'ALL' | 'TIERS' | 'CUSTOMERS';
export interface VoucherTier { id: string; code: string; name: string }
export interface VoucherCustomer { id: string; customerCode?: string | null; fullName: string; email?: string | null }
/**
 * A new voucher. No `code`: the backend generates it and returns it. The "value
 * add" type is no longer offered, so neither is its description. No start either: it starts
 * the moment it is created (2026-11-14); `validToAt` is its end, date and time.
 */
export type CreateVoucher = Omit<Voucher, 'id' | 'code' | 'usedCount' | 'stackable' | 'valueAddDescription' | 'properties' | 'displayStatus'
  | 'createdAt' | 'validFromAt' | 'tiers' | 'customers'> & {
  /** Hotel slugs; omitted or empty applies the voucher to every hotel. */
  propertySlugs?: string[];
  /** For TIERS: the chosen tiers. For CUSTOMERS: the chosen accounts. */
  tierIds?: string[];
  customerIds?: string[];
};
export interface Customer {
  id: string; fullName: string; email: string; phone?: string | null; country?: string | null;
  locale: string; createdAt: string; tier?: string | null; points: number; reservedPoints: number;
  /** `KAS-…` customer code. */
  customerCode?: string | null;
  /** `NO_ACCOUNT` (guest record), `UNVERIFIED`, `ACTIVE`, `SUSPENDED` or `DISABLED`. */
  accountStatus?: string | null;
  /** Versioned API path of the customer's photo, or null for none. */
  avatarUrl?: string | null;
}
export type UpdateCustomer = Pick<Customer, 'fullName' | 'phone' | 'country' | 'locale'>;
