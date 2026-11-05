// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

const declineApi = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    decline: (...a: unknown[]) => declineApi(...a),
    // The detail view renders the availability-check panel too, so the module
    // mock must carry its endpoint.
    availabilityCheck: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// The detail view now renders the availability-check panel, which shows a toast
// on success. The real ToastProvider is mounted by the partner layout, not by a
// unit render — so useToast is replaced and every other primitive stays real,
// the same shape inventory.test.tsx and policy.test.tsx use.
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));


const { DeclineRequestPanel, DECLINE_COPY } = await import('./DeclineRequestPanel');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

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
  return render(<DeclineRequestPanel reference={REFERENCE} copy={DECLINE_COPY} />);
}

function apiError(status: number, code: string, message = 'refused', details: unknown[] = []) {
  return new ApiError(status, { code, message, details: details as never, correlationId: 'c-1' });
}

/** Fills the reason and reaches the confirm step. */
async function armed(): Promise<void> {
  await userEvent.type(
    screen.getByLabelText(new RegExp(DECLINE_COPY.reasonLabel)),
    'Group booking that weekend.',
  );
  await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.action }));
}

beforeEach(() => {
  declineApi.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe('decline panel', () => {
  it('will not arm without a reason — the guard is "reason required"', async () => {
    panel();
    const button = screen.getByRole('button', { name: DECLINE_COPY.action }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(new RegExp(DECLINE_COPY.reasonLabel)), 'Because');
    expect((screen.getByRole('button', { name: DECLINE_COPY.action }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect(declineApi).not.toHaveBeenCalled();
  });

  it('takes two deliberate clicks — a decline is terminal and releases inventory', async () => {
    declineApi.mockResolvedValue(undefined);
    panel();
    await armed();

    // Arming does not submit. The second, differently-labelled button does.
    expect(declineApi).not.toHaveBeenCalled();
    expect(screen.getByText(DECLINE_COPY.confirmHint)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));
    await waitFor(() => expect(declineApi).toHaveBeenCalledTimes(1));
    expect(declineApi).toHaveBeenCalledWith(REFERENCE, 'Group booking that weekend.');
  });

  it('can be backed out of before it is confirmed', async () => {
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.cancel }));

    expect(screen.getByRole('button', { name: DECLINE_COPY.action })).toBeTruthy();
    expect(declineApi).not.toHaveBeenCalled();
  });

  it('re-reads the record on success rather than patching a local copy', async () => {
    declineApi.mockResolvedValue(undefined);
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));

    // The server owns the new state; a locally-flipped badge could show a status
    // the record does not have.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('cannot be submitted twice while in flight', async () => {
    let release: (value: unknown) => void = () => {};
    declineApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await armed();

    const confirm = screen.getByRole('button', { name: DECLINE_COPY.confirm });
    await userEvent.click(confirm);
    await waitFor(() => expect(declineApi).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole('button', { name: DECLINE_COPY.submitting }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await userEvent.click(busy);
    await userEvent.click(busy);
    expect(declineApi).toHaveBeenCalledTimes(1);

    release(undefined);
  });

  it('treats 409 as "someone else moved it", and never retries', async () => {
    declineApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(DECLINE_COPY.errorAlreadyMoved)).toBeTruthy());
    expect(declineApi).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the backend field message for a 400', async () => {
    declineApi.mockRejectedValue(apiError(400, 'VALIDATION_FAILED', 'Validation failed', [
      { field: 'reason', code: 'NotBlank', message: 'must not be blank' },
    ]));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));

    await waitFor(() => expect(screen.getByText('must not be blank')).toBeTruthy());
  });

  it('handles 404 without calling it a permission problem', async () => {
    declineApi.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(DECLINE_COPY.errorNotFound)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toMatch(/quyền|permission|forbidden/i);
  });

  it('handles a network failure without claiming anything happened', async () => {
    declineApi.mockRejectedValue(new TypeError('Failed to fetch'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(DECLINE_COPY.errorNetwork)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('says no notification is sent, before the agent commits', () => {
    panel();
    // OQ-162 is open and there is no mail sender. Nobody should decline
    // believing the guest has been told.
    expect(screen.getByText(DECLINE_COPY.noNotification)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/đã gửi email|email sent/i);
  });
});

describe('detail view actions', () => {
  it('offers decline while the request is live', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);
    expect(screen.getByRole('button', { name: DECLINE_COPY.action })).toBeTruthy();
  });

  it('offers nothing once the status is terminal', () => {
    for (const terminal of ['WON', 'DECLINED', 'CANCELLED', 'EXPIRED']) {
      render(<SalesRequestDetailView request={detail(terminal)} now={NOW} />);
      // Doc 54 §4 — salesStatus freezes at its terminal value.
      expect(screen.queryByRole('button', { name: DECLINE_COPY.action })).toBeNull();
      // The terminal state is shown by the absence of the actions and by the
      // status badge, not by a paragraph citing an internal document number.
      expect(screen.queryByText(/đã ở trạng thái cuối/)).toBeNull();
      cleanup();
    }
  });

  it('offers no accept, win or assign control at any status', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);
    // S10 needs config B12 and OQ-172; assignment needs B24/B25. A button the
    // server would refuse is worse than none.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Xác nhận đặt phòng|Chấp nhận|Nhận xử lý|Phân công/);
    expect(screen.queryByRole('button', { name: /Accept|Win|Assign/i })).toBeNull();
  });

  it('never says a declined request is confirmed', () => {
    render(<SalesRequestDetailView request={detail('DECLINED')} now={NOW} />);
    expect(screen.getByText('Đã từ chối')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/đã xác nhận|confirmed/i);
  });
});
