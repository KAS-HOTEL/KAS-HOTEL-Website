import { describe, expect, it } from 'vitest';
import { activeReservationTab, businessToday, reservationTabs } from './statusTabs';

// 2026-11-02 18:30 UTC is already 2026-11-03 in Ho Chi Minh City.
const NOW = Date.parse('2026-11-02T18:30:00Z');

describe('reservation status tabs', () => {
  it('uses the KAS business date, not UTC', () => {
    expect(businessToday(NOW)).toBe('2026-11-03');
  });

  it('offers the operational views in order, built only from filters the search accepts', () => {
    const tabs = reservationTabs(undefined, NOW);
    expect(tabs.map((tab) => tab.label)).toEqual([
      'Tất cả', 'Đã xác nhận', 'Sắp nhận phòng', 'Đang lưu trú', 'Đã trả phòng', 'Không đến', 'Đã hủy',
    ]);
    expect(tabs[0]?.href).toBe('/partner/reservations');
    expect(tabs[1]?.href).toBe('/partner/reservations?status=confirmed');
    expect(tabs[2]?.href).toBe('/partner/reservations?status=confirmed&checkInFrom=2026-11-03&checkInTo=2026-11-10');
    expect(tabs[3]?.href).toBe('/partner/reservations?status=inHouse');
  });

  it('keeps the selected hotel on every tab', () => {
    for (const tab of reservationTabs('kas-riverside', NOW)) {
      expect(tab.href).toContain('property=kas-riverside');
    }
  });

  it('marks the tab the URL shows, and none for a hand-made combination', () => {
    expect(activeReservationTab({}, NOW)).toBe('all');
    expect(activeReservationTab({ property: 'kas-riverside' }, NOW)).toBe('all');
    expect(activeReservationTab({ status: 'noShow' }, NOW)).toBe('noShow');
    expect(activeReservationTab({ status: 'confirmed', checkInFrom: '2026-11-03', checkInTo: '2026-11-10' }, NOW)).toBe('upcoming');
    expect(activeReservationTab({ status: 'confirmed', q: 'Bình' }, NOW)).toBe('');
    expect(activeReservationTab({ status: 'arrived' }, NOW)).toBe('');
  });
});
