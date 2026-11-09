import { describe, expect, it } from 'vitest';
import { describeConditions, formatSurchargeValue, hhmm, type Surcharge } from '@/lib/domain/surcharge';
import { codeFromName, draftProblem } from './SurchargeManager';

const base: Surcharge = {
  id: 'x', propertyId: null, propertySlug: null, propertyName: null,
  code: 'LATE_CHECK_OUT', name: 'Trả phòng muộn', description: null,
  category: 'LATE_CHECK_OUT', calculation: 'PERCENT_OF_ROOM_RATE', amountMinor: null, percent: 30,
  currency: 'VND', checkInFrom: null, checkInTo: null, checkOutFrom: '12:00:00', checkOutTo: '18:00:00',
  minAge: null, maxAge: null, aboveStandardOccupancy: false, stayFrom: null, stayTo: null,
  daysOfWeek: [], minNights: null, conditionNote: null, status: 'ACTIVE', preset: true,
  sortOrder: 40, version: 0,
};

const draft = {
  propertyId: '', code: 'TEST', name: 'Test', description: '', category: 'OTHER' as const,
  calculation: 'PER_NIGHT' as const, value: '100000', currency: 'VND', checkInFrom: '', checkInTo: '',
  checkOutFrom: '', checkOutTo: '', minAge: '', maxAge: '', aboveStandardOccupancy: false,
  stayFrom: '', stayTo: '', daysOfWeek: [], minNights: '', conditionNote: '', status: 'ACTIVE' as const,
  sortOrder: '100',
};

describe('surcharges', () => {
  it('formats amounts and percentages', () => {
    expect(formatSurchargeValue(base)).toBe('30% giá phòng 1 đêm');
    expect(formatSurchargeValue({ ...base, calculation: 'PER_PERSON_PER_NIGHT', amountMinor: 300000, percent: null }))
      .toMatch(/^300\.000 đ\/người\/đêm$/);
  });

  it('describes conditions in words, and none as always applying', () => {
    expect(describeConditions(base)).toEqual(['Trả phòng từ 12:00 đến 18:00']);
    expect(describeConditions({ ...base, checkOutFrom: null, checkOutTo: null })).toEqual([]);
    expect(describeConditions({ ...base, checkOutTo: null, aboveStandardOccupancy: true, minAge: 3, maxAge: 11, daysOfWeek: [6, 7] }))
      .toEqual(['Trả phòng sau 12:00', 'Vượt số người tiêu chuẩn của phòng', 'Tuổi 3–11', 'T7, CN']);
    expect(hhmm('14:00:00')).toBe('14:00');
  });

  it('derives an ASCII code from a Vietnamese name', () => {
    expect(codeFromName('Phụ thu thú cưng')).toBe('PHU_THU_THU_CUNG');
    expect(codeFromName('Đón sân bay')).toBe('DON_SAN_BAY');
    expect(codeFromName('24h check-in')).toBe('PT_24H_CHECK_IN');
  });

  it('checks the form before sending it', () => {
    expect(draftProblem(draft)).toBeNull();
    expect(draftProblem({ ...draft, code: 'bad code' })).toMatch(/Mã/);
    expect(draftProblem({ ...draft, calculation: 'PERCENT_OF_ROOM_RATE', value: '150' })).toMatch(/Phần trăm/);
    expect(draftProblem({ ...draft, checkOutFrom: '18:00', checkOutTo: '12:00' })).toMatch(/trả phòng/);
    expect(draftProblem({ ...draft, minAge: '12', maxAge: '3' })).toMatch(/Tuổi/);
  });
});
