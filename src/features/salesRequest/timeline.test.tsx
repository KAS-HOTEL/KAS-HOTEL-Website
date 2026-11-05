// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import { salesStatusLabel } from '@/lib/domain/salesRequest';
import type { SalesRequestDetail, SalesRequestEvent } from '@/lib/domain/salesRequest';

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    decline: vi.fn(),
    cancel: vi.fn(),
    availabilityCheck: vi.fn(),
    win: vi.fn(),
    contact: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

const { SalesRequestTimeline, TIMELINE_COPY } = await import('./SalesRequestTimeline');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

const NOW = Date.parse('2026-09-01T09:00:00Z');
const AGENT_UUID = '3f2b6c10-77aa-4c31-9f0e-1d2e3a4b5c6d';

function event(overrides: Partial<SalesRequestEvent> = {}): SalesRequestEvent {
  return {
    field: 'SALES',
    fromStatus: 'REQUESTED',
    toStatus: 'ASSIGNED',
    actorType: 'ADMIN',
    reason: null,
    note: null,
    at: '2026-09-01T08:30:00Z',
    ...overrides,
  };
}

/** The lifecycle as the backend actually records it, oldest first. */
const FULL_HISTORY: readonly SalesRequestEvent[] = [
  event({
    fromStatus: null,
    toStatus: 'REQUESTED',
    actorType: 'CUSTOMER',
    note: 'Guest submitted a direct reservation request (S1).',
    at: '2026-09-01T08:00:00Z',
  }),
  event({ toStatus: 'ASSIGNED', at: '2026-09-01T08:10:00Z' }),
  event({
    fromStatus: 'ASSIGNED',
    toStatus: 'AVAILABILITY_CHECK',
    at: '2026-09-01T08:20:00Z',
  }),
  event({
    fromStatus: 'AVAILABILITY_CHECK',
    toStatus: 'WON',
    note: 'Won. 2 hold night(s) converted, 0 released (S10).',
    at: '2026-09-01T08:30:00Z',
  }),
  event({
    field: 'STAY',
    fromStatus: null,
    toStatus: 'CONFIRMED',
    at: '2026-09-01T08:30:00.001Z',
  }),
];

function timeline(events: readonly SalesRequestEvent[]) {
  return render(<SalesRequestTimeline events={events} copy={TIMELINE_COPY} />);
}

function detail(
  salesStatus = 'REQUESTED',
  events: readonly SalesRequestEvent[] = FULL_HISTORY,
): SalesRequestDetail {
  return {
    summary: {
      reference: 'KAS-260912-4F7A',
      salesStatus,
      leadSource: 'WEBSITE',
      propertySlug: 'kas-milestone',
      propertyName: 'KAS Milestone',
      checkIn: '2026-09-12',
      checkOut: '2026-09-14',
      nights: 2,
      adults: 2,
      children: 0,
      rooms: 1,
      guestName: 'Nguyen Van A',
      requestedAt: '2026-09-01T08:00:00Z',
      slaDueAt: '2026-09-02T08:00:00Z',
      total: { amountMinor: 2_400_000, currency: 'VND', exponent: 0 },
    },
    lines: [{ roomTypeName: 'Deluxe Room', quantity: 1, nightly: null, lineTotal: null }],
    guest: null,
    timeline: events,
  };
}

/** One entry, checked — indexed access is `| undefined` under strict mode. */
function nth(entries: readonly HTMLElement[], index: number): HTMLElement {
  const entry = entries[index];
  if (entry === undefined) {
    throw new Error(`no timeline entry at index ${index}`);
  }
  return entry;
}

afterEach(cleanup);

describe('the timeline', () => {
  it('renders one entry per recorded transition, in the recorded order', () => {
    timeline(FULL_HISTORY);
    const entries = screen.getAllByRole('listitem');

    expect(entries).toHaveLength(FULL_HISTORY.length);
    // An ordered list, because the entries have a real sequence and a screen
    // reader should say so.
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(within(nth(entries, 0)).getByText('REQUESTED')).toBeTruthy();
    expect(within(nth(entries, 1)).getByText('ASSIGNED')).toBeTruthy();
    expect(within(nth(entries, 4)).getByText('CONFIRMED')).toBeTruthy();
  });

  it('shows status names exactly as recorded, not translated into new labels', () => {
    timeline(FULL_HISTORY);

    // The same vocabulary the status badge already uses. A second friendly name
    // per state is two names that can drift apart in meaning.
    expect(screen.getByText('AVAILABILITY_CHECK')).toBeTruthy();
    expect(screen.getByText('WON')).toBeTruthy();
  });

  it('distinguishes the two lifecycles a reservation carries', () => {
    timeline(FULL_HISTORY);
    const entries = screen.getAllByRole('listitem');

    // Doc 54 never conflates them: a won sale and a confirmed stay are different
    // facts, recorded here at the same instant.
    expect(within(nth(entries, 3)).getByText(TIMELINE_COPY.sales)).toBeTruthy();
    expect(within(nth(entries, 4)).getByText(TIMELINE_COPY.stay)).toBeTruthy();
  });

  it('translates the actor type and never names a person', () => {
    timeline([
      event({ actorType: 'CUSTOMER' }),
      event({ actorType: 'ADMIN' }),
      event({ actorType: 'SYSTEM', toStatus: 'EXPIRED' }),
    ]);

    expect(screen.getByText(TIMELINE_COPY.actorCustomer)).toBeTruthy();
    expect(screen.getByText(TIMELINE_COPY.actorAdmin)).toBeTruthy();
    expect(screen.getByText(TIMELINE_COPY.actorSystem)).toBeTruthy();
  });

  it('leaves an unrecognised actor type alone rather than guessing', () => {
    timeline([event({ actorType: 'PARTNER_API' })]);

    // A new actor type should look unfamiliar, not be relabelled as one of the
    // three that exist today.
    expect(screen.getByText('PARTNER_API')).toBeTruthy();
  });

  it('shows a reason where one was given and nothing where none was', () => {
    timeline([
      event({ toStatus: 'DECLINED', reason: 'Group booking that weekend.' }),
      event({ toStatus: 'AVAILABILITY_CHECK', reason: null }),
    ]);
    const entries = screen.getAllByRole('listitem');

    expect(within(nth(entries, 0)).getByText(/Group booking that weekend\./)).toBeTruthy();
    // No empty "Lý do:" label on a transition that never had one.
    expect(nth(entries, 1).textContent).not.toContain(TIMELINE_COPY.reason);
  });

  it('omits the from-status on the first entry of a lifecycle', () => {
    timeline([event({ fromStatus: null, toStatus: 'REQUESTED' })]);

    // A request did not come from somewhere; it began.
    expect(screen.queryByText(new RegExp(`^${TIMELINE_COPY.from}\\s`))).toBeNull();
  });

  it('renders a machine-readable timestamp', () => {
    const { container } = timeline([event({ at: '2026-09-01T08:30:00Z' })]);
    const time = container.querySelector('time');

    expect(time?.getAttribute('dateTime')).toBe('2026-09-01T08:30:00Z');
  });

  it('renders no internal identifier of any kind', () => {
    timeline([
      event({ note: 'Won. 2 hold night(s) converted, 0 released (S10).' }),
      event({ reason: `Handed to ${AGENT_UUID}` }),
    ]);

    // The backend sends no actor id, so none can be rendered. The reason above
    // is deliberately hostile: whatever an agent typed is shown, but nothing in
    // the component's own markup adds an identifier.
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/actorId|reservationId|salesOwnerId|propertyId|partnerId/i);
  });

  it('handles a long reason without breaking out of its entry', () => {
    const long = 'Khách yêu cầu đổi ngày. '.repeat(30);
    timeline([event({ reason: long })]);

    // Rendered in full rather than truncated in markup — the agent needs the
    // whole note, and wrapping is the stylesheet's job.
    expect(screen.getByText(new RegExp('Khách yêu cầu đổi ngày'))).toBeTruthy();
  });

  it('says a missing history is missing, rather than showing a bland empty state', () => {
    timeline([]);

    // S1 writes an entry for every request, so an empty timeline is a record
    // that did not arrive — not the ordinary state of a new request.
    expect(screen.getByText(TIMELINE_COPY.missing)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

/**
 * The detail page draws its own compact history ("Lịch sử cập nhật") in the
 * handling column: sales statuses in the badge's Vietnamese, newest first, with
 * who acted and when. The full component above keeps its own tests.
 */
describe('the detail page', () => {
  it('shows the sales history newest first, in Vietnamese, without raw codes', () => {
    const { container } = render(<SalesRequestDetailView request={detail()} now={NOW} />);

    expect(screen.getByText('Lịch sử cập nhật')).toBeTruthy();
    expect(screen.queryByText(TIMELINE_COPY.title)).toBeNull();
    const entries = [...(container.querySelector('ol')?.querySelectorAll('li') ?? [])];
    // Four sales transitions; the stay's CONFIRMED is not part of this history.
    expect(entries).toHaveLength(4);
    expect(entries[0]?.textContent).toContain(salesStatusLabel('WON'));
    expect(entries[3]?.textContent).toContain(salesStatusLabel('REQUESTED'));
    expect(entries[3]?.textContent).toContain('Khách hàng');
    for (const raw of ['ASSIGNED', 'AVAILABILITY_CHECK', 'WON', 'CONFIRMED']) {
      expect(screen.queryByText(raw)).toBeNull();
    }
    // The machine's English notes and raw ISO timestamps stay off the page.
    expect(screen.queryByText(/Won\. 2 hold night/)).toBeNull();
    expect(screen.queryByText(/2026-09-01T08:10/)).toBeNull();
  });

  it('draws a history entry whose reason and note were left out of the JSON', () => {
    const onTheWire = [{ field: 'SALES', fromStatus: null, toStatus: 'REQUESTED', actorType: 'CUSTOMER', at: '2026-09-01T08:00:00Z' }] as unknown as SalesRequestEvent[];
    render(<SalesRequestDetailView request={detail('REQUESTED', onTheWire)} now={NOW} />);
    expect(screen.getByText('Lịch sử cập nhật')).toBeTruthy();
    expect(screen.getAllByText(salesStatusLabel('REQUESTED')).length).toBeGreaterThan(0);
  });

  it('leaves the existing action panels working', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối yêu cầu' })).toBeTruthy();
  });

  it('explains nothing on a terminal request — it simply offers nothing', () => {
    render(<SalesRequestDetailView request={detail('DECLINED')} now={NOW} />);

    expect(screen.queryByRole('button', { name: 'Từ chối yêu cầu' })).toBeNull();
    expect(screen.queryByText(TIMELINE_COPY.title)).toBeNull();
    expect(screen.queryByText(/đã ở trạng thái cuối/)).toBeNull();
  });
});
