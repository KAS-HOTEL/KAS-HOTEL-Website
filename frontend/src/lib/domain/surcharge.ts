/**
 * Surcharges (phụ thu) — `pricing.api.AdminSurchargeController`, SUPER_ADMIN only.
 *
 * A surcharge with no hotel applies to every hotel. A hotel's own surcharge with the
 * same code replaces the all-hotels one for that hotel. Conditions are optional and
 * all must hold; a surcharge with none always applies.
 */

export const SURCHARGE_CATEGORIES = [
  'EARLY_CHECK_IN', 'LATE_CHECK_OUT', 'EXTRA_ADULT', 'EXTRA_CHILD', 'EXTRA_BED', 'HOLIDAY', 'OTHER',
] as const;
export type SurchargeCategory = (typeof SURCHARGE_CATEGORIES)[number];

export const SURCHARGE_CALCULATIONS = [
  'PER_STAY', 'PER_NIGHT', 'PER_PERSON_PER_NIGHT', 'PER_PERSON_PER_STAY', 'PERCENT_OF_ROOM_RATE',
] as const;
export type SurchargeCalculation = (typeof SURCHARGE_CALCULATIONS)[number];

export type SurchargeStatus = 'ACTIVE' | 'INACTIVE';

export const CATEGORY_LABEL: Readonly<Record<SurchargeCategory, string>> = {
  EARLY_CHECK_IN: 'Nhận phòng sớm',
  LATE_CHECK_OUT: 'Trả phòng muộn',
  EXTRA_ADULT: 'Người lớn ở thêm',
  EXTRA_CHILD: 'Trẻ em ở thêm',
  EXTRA_BED: 'Giường phụ',
  HOLIDAY: 'Lễ, Tết',
  OTHER: 'Khác',
};

export const CALCULATION_LABEL: Readonly<Record<SurchargeCalculation, string>> = {
  PER_STAY: 'Một lần mỗi lượt lưu trú',
  PER_NIGHT: 'Mỗi đêm',
  PER_PERSON_PER_NIGHT: 'Mỗi người mỗi đêm',
  PER_PERSON_PER_STAY: 'Mỗi người mỗi lượt lưu trú',
  PERCENT_OF_ROOM_RATE: '% giá phòng 1 đêm',
};

export const DAY_LABEL: Readonly<Record<number, string>> = {
  1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN',
};

export interface Surcharge {
  readonly id: string;
  readonly propertyId: string | null;
  readonly propertySlug: string | null;
  readonly propertyName: string | null;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: SurchargeCategory;
  readonly calculation: SurchargeCalculation;
  readonly amountMinor: number | null;
  readonly percent: number | null;
  readonly currency: string;
  /** "HH:mm:ss" as the backend sends a LocalTime. */
  readonly checkInFrom: string | null;
  readonly checkInTo: string | null;
  readonly checkOutFrom: string | null;
  readonly checkOutTo: string | null;
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly aboveStandardOccupancy: boolean;
  readonly stayFrom: string | null;
  readonly stayTo: string | null;
  /** ISO days, 1 = Monday … 7 = Sunday; empty = every day. */
  readonly daysOfWeek: readonly number[];
  readonly minNights: number | null;
  readonly conditionNote: string | null;
  readonly status: SurchargeStatus;
  /** Seeded common surcharge: editable and switchable, never deletable. */
  readonly preset: boolean;
  readonly sortOrder: number;
  readonly version: number;
}

export interface SurchargeRequest {
  readonly propertyId: string | null;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: SurchargeCategory;
  readonly calculation: SurchargeCalculation;
  readonly amountMinor: number | null;
  readonly percent: number | null;
  readonly currency: string;
  readonly checkInFrom: string | null;
  readonly checkInTo: string | null;
  readonly checkOutFrom: string | null;
  readonly checkOutTo: string | null;
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly aboveStandardOccupancy: boolean;
  readonly stayFrom: string | null;
  readonly stayTo: string | null;
  readonly daysOfWeek: readonly number[];
  readonly minNights: number | null;
  readonly conditionNote: string | null;
  readonly status: SurchargeStatus;
  readonly sortOrder: number;
  readonly version?: number;
}

/** "14:00:00" → "14:00". */
export function hhmm(time: string | null): string {
  return time === null ? '' : (/^\d{2}:\d{2}/.exec(time)?.[0] ?? time);
}

export function formatSurchargeValue(row: Pick<Surcharge, 'calculation' | 'amountMinor' | 'percent' | 'currency'>): string {
  if (row.calculation === 'PERCENT_OF_ROOM_RATE') {
    return `${row.percent ?? '—'}% giá phòng 1 đêm`;
  }
  const amount = row.amountMinor === null ? '—' : new Intl.NumberFormat('vi-VN').format(row.amountMinor);
  const per: Record<string, string> = {
    PER_STAY: '/lượt', PER_NIGHT: '/đêm', PER_PERSON_PER_NIGHT: '/người/đêm', PER_PERSON_PER_STAY: '/người',
  };
  return `${amount} ${row.currency === 'VND' ? 'đ' : row.currency}${per[row.calculation] ?? ''}`;
}

/** The conditions in words, one per entry; empty = always applies. */
export function describeConditions(row: Surcharge): readonly string[] {
  const out: string[] = [];
  const window = (label: string, from: string | null, to: string | null) => {
    if (from && to) out.push(`${label} từ ${hhmm(from)} đến ${hhmm(to)}`);
    else if (from) out.push(`${label} sau ${hhmm(from)}`);
    else if (to) out.push(`${label} trước ${hhmm(to)}`);
  };
  window('Nhận phòng', row.checkInFrom, row.checkInTo);
  window('Trả phòng', row.checkOutFrom, row.checkOutTo);
  if (row.aboveStandardOccupancy) out.push('Vượt số người tiêu chuẩn của phòng');
  if (row.minAge !== null && row.maxAge !== null) out.push(`Tuổi ${row.minAge}–${row.maxAge}`);
  else if (row.minAge !== null) out.push(`Từ ${row.minAge} tuổi`);
  else if (row.maxAge !== null) out.push(`Đến ${row.maxAge} tuổi`);
  if (row.stayFrom || row.stayTo) out.push(`Ngày lưu trú ${row.stayFrom ?? '…'} → ${row.stayTo ?? '…'}`);
  if (row.daysOfWeek.length > 0 && row.daysOfWeek.length < 7) {
    out.push(row.daysOfWeek.map((day) => DAY_LABEL[day] ?? String(day)).join(', '));
  }
  if (row.minNights !== null) out.push(`Từ ${row.minNights} đêm`);
  return out;
}
