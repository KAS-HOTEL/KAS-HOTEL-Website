export interface GuestReview {
  id: string; hotelKey: string; rating: number; title?: string; body: string;
  language: string; stayMonth?: string; status: string;
  hiddenAt?: string | null; deletedAt?: string | null; publishedAt?: string | null;
}
export type ReviewAction = 'APPROVE' | 'REJECT' | 'HIDE' | 'SHOW' | 'DELETE';
export interface Voucher {
  id: string; code: string; name: string; description?: string; type: string;
  valuePercent?: number | null; valueMinor?: number | null; valueAddDescription?: string;
  currency: string; validFrom?: string; validTo?: string; stayFrom?: string; stayTo?: string;
  minNights?: number | null; minTotalMinor?: number | null; usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null; usedCount: number; stackable: boolean; status: string;
  /** Hotels the voucher applies to; empty means every hotel. */
  properties?: readonly { slug: string; name: string }[];
}
/**
 * A new voucher. No `code`: the backend generates it and returns it. The "value
 * add" type is no longer offered, so neither is its description.
 */
export type CreateVoucher = Omit<Voucher, 'id' | 'code' | 'usedCount' | 'stackable' | 'valueAddDescription' | 'properties'> & {
  /** Hotel slugs; omitted or empty applies the voucher to every hotel. */
  propertySlugs?: string[];
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
