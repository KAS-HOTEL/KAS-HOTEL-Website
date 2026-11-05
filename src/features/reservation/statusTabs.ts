import { STAY_STATUS_GROUP_LABEL, STAY_STATUS_GROUP_ORDER, type StayStatusGroup } from '@/lib/domain/reservation';
import type { TabItem } from '@/ui/primitives';

/**
 * The reservations screen's operational views.
 *
 * Each tab is a URL built from filters the search already accepts — the stay
 * status group (`status`) and, for "Sắp nhận phòng", a check-in window — so no new
 * backend semantics are invented. The selected hotel is kept across tabs. These are
 * stay statuses only; booking request statuses live on the request queue.
 */
export const RESERVATIONS_PATH = '/partner/reservations';

/** How far ahead "Sắp nhận phòng" looks, in days, from today in KAS business time. */
export const UPCOMING_DAYS = 7;

/** Today's date in Asia/Ho_Chi_Minh, as yyyy-MM-dd. */
export function businessToday(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(now));
}

function addDays(isoDate: string, days: number): string {
  const at = new Date(`${isoDate}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

type ViewId = 'all' | 'upcoming' | StayStatusGroup;

function viewParams(view: ViewId, today: string): Record<string, string> {
  if (view === 'all') {
    return {};
  }
  if (view === 'upcoming') {
    return { status: 'confirmed', checkInFrom: today, checkInTo: addDays(today, UPCOMING_DAYS) };
  }
  return { status: view };
}

export function reservationTabs(property: string | undefined, now: number): readonly TabItem[] {
  const today = businessToday(now);
  const views: readonly { id: ViewId; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'confirmed', label: STAY_STATUS_GROUP_LABEL.confirmed },
    { id: 'upcoming', label: 'Sắp nhận phòng' },
    ...STAY_STATUS_GROUP_ORDER.filter((group) => group !== 'confirmed').map((group) => ({
      id: group as ViewId,
      label: STAY_STATUS_GROUP_LABEL[group],
    })),
  ];
  return views.map((view) => {
    const params = new URLSearchParams(viewParams(view.id, today));
    if (property !== undefined && property !== '') {
      params.set('property', property);
    }
    const query = params.toString();
    return { id: view.id, label: view.label, href: query === '' ? RESERVATIONS_PATH : `${RESERVATIONS_PATH}?${query}` };
  });
}

/** Which tab the URL shows, or '' when the filters in force are not one of the views. */
export function activeReservationTab(
  params: Record<string, string | string[] | undefined>,
  now: number,
): string {
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const set = Object.keys(params).filter((key) => key !== 'property' && key !== 'page' && value(key));
  const status = value('status');
  if (set.length === 0) {
    return 'all';
  }
  const today = businessToday(now);
  const only = (...keys: string[]) => [...set].sort().join(',') === [...keys].sort().join(',');
  if (status === 'confirmed' && value('checkInFrom') === today && value('checkInTo') === addDays(today, UPCOMING_DAYS)
      && only('status', 'checkInFrom', 'checkInTo')) {
    return 'upcoming';
  }
  if (only('status') && status !== undefined && (STAY_STATUS_GROUP_ORDER as readonly string[]).includes(status)) {
    return status;
  }
  return '';
}
