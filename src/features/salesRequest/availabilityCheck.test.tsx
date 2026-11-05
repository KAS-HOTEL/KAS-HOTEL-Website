// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

const checkApi = vi.fn();
const declineApi = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    availabilityCheck: (...a: unknown[]) => checkApi(...a),
    decline: (...a: unknown[]) => declineApi(...a),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// The real ToastProvider is mounted by the partner layout, not by a unit render.
// Only `useToast` is replaced; `Button`, `Card` and the rest stay real, so these
// tests still exercise the actual design-system components.
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}));

const { AvailabilityCheckPanel, AVAILABILITY_CHECK_COPY } =
  await import('./AvailabilityCheckPanel');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');
const { DECLINE_COPY } = await import('./DeclineRequestPanel');

const REFERENCE = 'KAS-260912-4F7A';
const NOW = Date.parse('2026-09-01T09:00:00Z');

function detail(salesStatus = 'REQUESTED'): SalesRequestDetail {
  return {
    summary: {
      reference: REFERENCE,
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
    timeline: [
      {
        field: 'SALES',
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorType: 'CUSTOMER',
        reason: null,
        note: 'Guest submitted a direct reservation request (S1).',
        at: '2026-09-01T08:00:00Z',
      },
    ],
  };
}

function panel() {
  return render(
    <AvailabilityCheckPanel reference={REFERENCE} copy={AVAILABILITY_CHECK_COPY} />,
  );
}

function apiError(status: number, code: string, message = 'refused') {
  return new ApiError(status, { code, message, details: [], correlationId: 'c-1' });
}

function actionButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: AVAILABILITY_CHECK_COPY.action }) as HTMLButtonElement;
}

beforeEach(() => {
  checkApi.mockReset();
  declineApi.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});
afterEach(cleanup);

describe('availability check — the call', () => {
  it('posts to the endpoint with this request’s reference and no body', async () => {
    checkApi.mockResolvedValue(undefined);
    panel();

    await userEvent.click(actionButton());

    await waitFor(() => expect(checkApi).toHaveBeenCalledTimes(1));
    // The reference is the only argument. Doc 58 §5 gives this route no body:
    // the reservation already carries its property, dates and lines.
    expect(checkApi).toHaveBeenCalledWith(REFERENCE);
  });

  it('needs one click — a re-check moves no rooms and releases nothing', async () => {
    checkApi.mockResolvedValue(undefined);
    panel();

    // Deliberately unlike the decline panel, which arms first: that action is
    // terminal and hands inventory back. This one is the ordinary next step.
    await userEvent.click(actionButton());
    await waitFor(() => expect(checkApi).toHaveBeenCalledTimes(1));
  });

  it('shows the in-flight state and keeps the rest of the panel', async () => {
    let release: (value: unknown) => void = () => {};
    checkApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();

    await userEvent.click(actionButton());
    await waitFor(() => expect(checkApi).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole('button', {
      name: AVAILABILITY_CHECK_COPY.submitting,
    }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    // The explanation stays on screen — the page is not replaced by a spinner.
    expect(screen.getByText(AVAILABILITY_CHECK_COPY.intro)).toBeTruthy();

    release(undefined);
  });

  it('cannot issue a second check while the first is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    checkApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();

    await userEvent.click(actionButton());
    await waitFor(() => expect(checkApi).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole('button', { name: AVAILABILITY_CHECK_COPY.submitting });
    await userEvent.click(busy);
    await userEvent.click(busy);

    // One agent, one availability check.
    expect(checkApi).toHaveBeenCalledTimes(1);
    release(undefined);
  });
});

describe('availability check — success', () => {
  it('re-reads the record on 204 rather than patching a local copy', async () => {
    checkApi.mockResolvedValue(undefined);
    panel();

    await userEvent.click(actionButton());

    // The 204 carries no state. The status it moved to is the server's to report.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toastShow).toHaveBeenCalledWith('success', AVAILABILITY_CHECK_COPY.success);
  });

  it('renders no availability figure, because the endpoint returns none', async () => {
    checkApi.mockResolvedValue(undefined);
    panel();
    await userEvent.click(actionButton());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // A 204 says the transition happened, not what it found. Inventing a number
    // here would be the frontend claiming a result it was never given.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/còn\s*\d+\s*phòng|\d+\s*phòng trống/i);
  });

  it('becomes available again after a failure, so the agent can retry', async () => {
    checkApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    panel();

    await userEvent.click(actionButton());
    await waitFor(() =>
      expect(screen.getByText(AVAILABILITY_CHECK_COPY.errorNetwork)).toBeTruthy(),
    );
    expect(actionButton().disabled).toBe(false);
  });
});

describe('availability check — refusals', () => {
  it('treats 409 as "someone else moved it", and never retries', async () => {
    checkApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    panel();

    await userEvent.click(actionButton());

    await waitFor(() =>
      expect(screen.getByText(AVAILABILITY_CHECK_COPY.errorAlreadyMoved)).toBeTruthy(),
    );
    expect(checkApi).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('says plainly when the rooms are gone — 422 NO_AVAILABILITY', async () => {
    checkApi.mockRejectedValue(apiError(422, 'NO_AVAILABILITY', 'no rooms'));
    panel();

    await userEvent.click(actionButton());

    // The check ran and answered. That is the agent's answer, not a validation
    // problem, and the server rolled the transition back with it.
    await waitFor(() =>
      expect(screen.getByText(AVAILABILITY_CHECK_COPY.errorNoAvailability)).toBeTruthy(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders 403 through the shared mapping, without inventing wording', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    checkApi.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    panel();

    await userEvent.click(actionButton());
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.forbidden)).toBeTruthy());
  });

  it('renders 404 as not-found and never as a permission problem', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    checkApi.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    panel();

    await userEvent.click(actionButton());

    // Doc 85 §6.3 — another partner's reference answers 404 precisely so the
    // existence of their record is not disclosed. Re-describing it as
    // "forbidden" would leak what the 404 exists to hide.
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.notFound)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain(AUTH_MESSAGES.forbidden);
  });

  it('renders 401 as an expired session', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    checkApi.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    panel();

    await userEvent.click(actionButton());
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.expired)).toBeTruthy());
  });

  it('handles a network failure without claiming anything happened', async () => {
    checkApi.mockRejectedValue(new TypeError('Failed to fetch'));
    panel();

    await userEvent.click(actionButton());

    await waitFor(() =>
      expect(screen.getByText(AVAILABILITY_CHECK_COPY.errorNetwork)).toBeTruthy(),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('announces the failure once, in a live region', async () => {
    checkApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    const { container } = panel();

    await userEvent.click(actionButton());
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain(AVAILABILITY_CHECK_COPY.errorAlreadyMoved);
  });
});

describe('detail view — where the action is offered', () => {
  it('is no longer drawn on the request page (removed at the hotel\'s request)', () => {
    for (const status of ['REQUESTED', 'ASSIGNED']) {
      render(<SalesRequestDetailView request={detail(status)} now={NOW} />);
      expect(screen.queryByRole('button', { name: AVAILABILITY_CHECK_COPY.action })).toBeNull();
      // The hotel answers with "Còn phòng — xác nhận và gửi QR" instead.
      expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
      cleanup();
    }
  });

  it('offers no check once the request is already at AVAILABILITY_CHECK', () => {
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);

    // Doc 54 has no AVAILABILITY_CHECK → AVAILABILITY_CHECK row. A button the
    // server would answer 409 is worse than none.
    expect(screen.queryByRole('button', { name: AVAILABILITY_CHECK_COPY.action })).toBeNull();
    // Decline is still live: the request is not terminal.
    expect(screen.getByRole('button', { name: DECLINE_COPY.action })).toBeTruthy();
  });

  it('offers no check in any terminal state', () => {
    for (const terminal of ['WON', 'DECLINED', 'CANCELLED', 'EXPIRED']) {
      render(<SalesRequestDetailView request={detail(terminal)} now={NOW} />);
      expect(screen.queryByRole('button', { name: AVAILABILITY_CHECK_COPY.action })).toBeNull();
      // The terminal state is shown by the absence of the actions and by the
      // status badge, not by a paragraph citing an internal document number.
      expect(screen.queryByText(/đã ở trạng thái cuối/)).toBeNull();
      cleanup();
    }
  });

  it('leaves the decline action exactly as it was', async () => {
    declineApi.mockResolvedValue(undefined);
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    // Still two deliberate clicks, and still its own reason field.
    await userEvent.type(
      screen.getByLabelText(new RegExp(DECLINE_COPY.reasonLabel)),
      'Group booking that weekend.',
    );
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.action }));
    expect(declineApi).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));
    await waitFor(() => expect(declineApi).toHaveBeenCalledTimes(1));
    expect(checkApi).not.toHaveBeenCalled();
  });

  it('still offers no assign or win control — the backend has them, this screen does not', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Xác nhận đặt phòng|Phân công|Nhận xử lý/);
    expect(screen.queryByRole('button', { name: /Assign|Win/i })).toBeNull();
  });

  it('exposes no internal identifier through the new action', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);
    expect(document.body.innerHTML).not.toMatch(
      /salesOwnerId|partnerId|propertyId|reservationId|priceSnapshot/i,
    );
  });
});

describe('accessibility', () => {
  it('is reachable and operable from the keyboard alone', async () => {
    checkApi.mockResolvedValue(undefined);
    panel();

    await userEvent.tab();
    expect(document.activeElement).toBe(actionButton());

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(checkApi).toHaveBeenCalledTimes(1));
  });

  it('has an accessible name that says what it does', () => {
    panel();
    // Not "OK", not an icon alone.
    expect(actionButton().textContent).toContain('Kiểm tra phòng trống');
  });
});
