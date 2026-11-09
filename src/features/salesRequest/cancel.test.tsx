// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

const cancelApi = vi.fn();
const declineApi = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    cancel: (...a: unknown[]) => cancelApi(...a),
    decline: (...a: unknown[]) => declineApi(...a),
    availabilityCheck: vi.fn(),
    win: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}));

const { CancelRequestPanel, CANCEL_COPY } = await import('./CancelRequestPanel');
const { DECLINE_COPY } = await import('./DeclineRequestPanel');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

const REFERENCE = 'KAS-260912-4F7A';
const NOW = Date.parse('2026-09-01T09:00:00Z');
const REASON = 'Khách báo huỷ qua điện thoại.';

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
  return render(<CancelRequestPanel reference={REFERENCE} copy={CANCEL_COPY} />);
}

function apiError(status: number, code: string, message = 'refused', details: unknown[] = []) {
  return new ApiError(status, { code, message, details: details as never, correlationId: 'c-1' });
}

/** Fills the reason and reaches the confirm step. */
async function armed(): Promise<void> {
  await userEvent.type(screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel)), REASON);
  await userEvent.selectOptions(screen.getByLabelText(/Ai yêu cầu huỷ/), 'GUEST');
  await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.action }));
}

beforeEach(() => {
  cancelApi.mockReset();
  declineApi.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});
afterEach(cleanup);

describe('cancel — the guard', () => {
  it('will not arm without a reason — doc 54 S12 requires one', async () => {
    panel();
    const button = screen.getByRole('button', { name: CANCEL_COPY.action }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel)), 'Vì');
    // 2026-11-07: who asked for the cancellation must be stated too.
    expect((screen.getByRole('button', { name: CANCEL_COPY.action }) as HTMLButtonElement).disabled)
      .toBe(true);
    await userEvent.selectOptions(screen.getByLabelText(/Ai yêu cầu huỷ/), 'KAS');
    expect((screen.getByRole('button', { name: CANCEL_COPY.action }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect(cancelApi).not.toHaveBeenCalled();
  });

  it('takes two deliberate clicks — a cancel is terminal and releases inventory', async () => {
    cancelApi.mockResolvedValue(undefined);
    panel();
    await armed();

    expect(cancelApi).not.toHaveBeenCalled();
    expect(screen.getByText(CANCEL_COPY.confirmHint)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));
    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));
    // The trimmed reason and who asked; no payment check unless the server asks for one.
    expect(cancelApi).toHaveBeenCalledWith(REFERENCE, REASON, { requestedBy: 'GUEST', paymentChecked: false });
  });

  it('can be backed out of before it is confirmed', async () => {
    panel();
    await armed();

    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.cancel }));

    expect(screen.getByRole('button', { name: CANCEL_COPY.action })).toBeTruthy();
    expect(cancelApi).not.toHaveBeenCalled();
  });

  it('labels the back-out control distinctly from the action itself', () => {
    panel();
    // "Huỷ" next to "Huỷ yêu cầu" would leave an agent guessing which one
    // abandons the form and which one cancels the guest's request.
    expect(CANCEL_COPY.cancel).not.toBe('Huỷ');
    expect(CANCEL_COPY.cancel).toBe('Quay lại');
  });
});

describe('cancel — submission', () => {
  it('cannot be submitted twice while in flight', async () => {
    let release: (value: unknown) => void = () => {};
    cancelApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await armed();

    const confirm = screen.getByRole('button', { name: CANCEL_COPY.confirm });
    await userEvent.click(confirm);
    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole('button', { name: CANCEL_COPY.submitting }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(busy);
    await userEvent.click(busy);
    expect(cancelApi).toHaveBeenCalledTimes(1);

    release(undefined);
  });

  it('repeated keyboard activation still produces exactly one request', async () => {
    let release: (value: unknown) => void = () => {};
    cancelApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await armed();

    screen.getByRole('button', { name: CANCEL_COPY.confirm }).focus();
    await userEvent.keyboard('{Enter}{Enter}{Enter}');

    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));
    expect(cancelApi).toHaveBeenCalledTimes(1);
    release(undefined);
  });

  it('keeps the reason on screen while submitting', async () => {
    let release: (value: unknown) => void = () => {};
    cancelApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));
    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));

    const field = screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel)) as HTMLTextAreaElement;
    expect(field.value).toBe(REASON);
    expect(field.disabled).toBe(true);
    release(undefined);
  });
});

describe('cancel — success', () => {
  it('re-reads the record on 204 and reports it, rather than patching a local copy', async () => {
    cancelApi.mockResolvedValue(undefined);
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toastShow).toHaveBeenCalledWith('success', CANCEL_COPY.success);
  });

  it('never claims CANCELLED before the server has been re-read', async () => {
    let release: (value: unknown) => void = () => {};
    cancelApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { container } = panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));
    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));

    // Mid-flight the panel asserts nothing about the outcome; the status badge
    // is the detail view's, rendered from server data.
    expect(container.textContent).not.toContain(CANCEL_COPY.success);
    expect(refresh).not.toHaveBeenCalled();
    release(undefined);
  });
});

describe('cancel — refusals', () => {
  it('treats 409 as "someone else moved it", and never retries', async () => {
    cancelApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(CANCEL_COPY.errorAlreadyMoved)).toBeTruthy());
    expect(cancelApi).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
    expect(CANCEL_COPY.errorAlreadyMoved).toMatch(/tải lại/);
  });

  it('shows the backend field message for a 400', async () => {
    cancelApi.mockRejectedValue(apiError(400, 'VALIDATION_FAILED', 'Validation failed', [
      { field: 'reason', code: 'NotBlank', message: 'must not be blank' },
    ]));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getByText('must not be blank')).toBeTruthy());
  });

  it('handles 404 without calling it a permission problem', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    cancelApi.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    // Doc 85 §6.3 — another partner's reference answers 404 so the existence of
    // their record is not disclosed. Re-describing it as forbidden would leak it.
    await waitFor(() => expect(screen.getByText(CANCEL_COPY.errorNotFound)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain(AUTH_MESSAGES.forbidden);
  });

  it('renders 403 as a permission problem, distinct from 404', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    cancelApi.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.forbidden)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain(CANCEL_COPY.errorNotFound);
  });

  it('renders 401 as an expired session', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    cancelApi.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.expired)).toBeTruthy());
  });

  it('handles a network failure without claiming anything happened', async () => {
    cancelApi.mockRejectedValue(new TypeError('Failed to fetch'));
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(CANCEL_COPY.errorNetwork)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('leaks no internal backend text for a 500', async () => {
    cancelApi.mockRejectedValue(
      apiError(500, 'INTERNAL_ERROR', 'org.postgresql.util.PSQLException: relation "x"'),
    );
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getByText(CANCEL_COPY.errorServer)).toBeTruthy());
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/PSQLException|org\.postgresql|relation/);
  });

  it('announces the failure once, in a live region', async () => {
    cancelApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    const { container } = panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain(CANCEL_COPY.errorAlreadyMoved);
  });

  it('says no notification is sent, before the agent commits', () => {
    panel();
    // OQ-162 is open and there is no mail sender. Nobody should record a
    // cancellation believing the guest has been told.
    expect(screen.getByText(CANCEL_COPY.noNotification)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/đã gửi email|email sent/i);
  });
});

describe('detail view — where cancel is offered', () => {
  it('is offered from every non-terminal state, alongside decline', () => {
    for (const status of ['REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK']) {
      render(<SalesRequestDetailView request={detail(status)} now={NOW} />);
      expect(screen.getByRole('button', { name: CANCEL_COPY.action })).toBeTruthy();
      expect(screen.getByRole('button', { name: DECLINE_COPY.action })).toBeTruthy();
      cleanup();
    }
  });

  it('is offered in no terminal state', () => {
    for (const terminal of ['WON', 'DECLINED', 'CANCELLED', 'EXPIRED']) {
      render(<SalesRequestDetailView request={detail(terminal)} now={NOW} />);
      expect(screen.queryByRole('button', { name: CANCEL_COPY.action })).toBeNull();
      // The terminal state is shown by the absence of the actions and by the
      // status badge, not by a paragraph citing an internal document number.
      expect(screen.queryByText(/đã ở trạng thái cuối/)).toBeNull();
      cleanup();
    }
  });

  it('keeps the two reason fields separate — one panel cannot fill the other', async () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    const cancelField = screen.getByLabelText(
      new RegExp(CANCEL_COPY.reasonLabel),
    ) as HTMLTextAreaElement;
    const declineField = screen.getByLabelText(
      new RegExp(DECLINE_COPY.reasonLabel),
    ) as HTMLTextAreaElement;

    // Distinct ids, or the labels would both point at one control.
    expect(cancelField.id).not.toBe(declineField.id);

    await userEvent.type(cancelField, 'chỉ huỷ');
    expect(cancelField.value).toBe('chỉ huỷ');
    expect(declineField.value).toBe('');
  });

  it('arming one panel does not arm the other', async () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    await userEvent.type(screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel)), REASON);
    await userEvent.selectOptions(screen.getByLabelText(/Ai yêu cầu huỷ/), 'GUEST');
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.action }));

    expect(screen.getByRole('button', { name: CANCEL_COPY.confirm })).toBeTruthy();
    expect(screen.queryByRole('button', { name: DECLINE_COPY.confirm })).toBeNull();
    expect(screen.getByRole('button', { name: DECLINE_COPY.action })).toBeTruthy();
  });

  it('cancelling calls only the cancel endpoint', async () => {
    cancelApi.mockResolvedValue(undefined);
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    await userEvent.type(screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel)), REASON);
    await userEvent.selectOptions(screen.getByLabelText(/Ai yêu cầu huỷ/), 'GUEST');
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.action }));
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));

    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));
    expect(declineApi).not.toHaveBeenCalled();
  });

  it('exposes no internal identifier', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);
    expect(document.body.innerHTML).not.toMatch(
      /reservationId|holdId|partnerId|salesOwnerId|cancellation_reason|cancelled_at/i,
    );
  });
});

describe('accessibility', () => {
  it('labels the field and the action, and works from the keyboard', async () => {
    cancelApi.mockResolvedValue(undefined);
    panel();

    const field = screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel));
    field.focus();
    await userEvent.keyboard(REASON);

    // 2026-11-07: the requester select sits between the reason and the action.
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/Ai yêu cầu huỷ/));
    await userEvent.selectOptions(screen.getByLabelText(/Ai yêu cầu huỷ/), 'GUEST');
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: CANCEL_COPY.action }),
    );
    await userEvent.keyboard('{Enter}');

    screen.getByRole('button', { name: CANCEL_COPY.confirm }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(1));
  });

  it('asks staff to check the account when the guest reported a transfer, then sends the check', async () => {
    cancelApi.mockRejectedValueOnce(apiError(409, 'ILLEGAL_TRANSITION', 'refused', [
      { field: 'paymentChecked', code: 'PAYMENT_REPORTED_CHECK_FIRST', message: 'check first' },
    ]));
    cancelApi.mockResolvedValueOnce(undefined);
    panel();
    await armed();
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/đã chuyển khoản/));
    // Not mistaken for "someone else moved it".
    expect(screen.getByRole('alert').textContent).not.toBe(CANCEL_COPY.errorAlreadyMoved);
    const action = screen.getByRole('button', { name: CANCEL_COPY.action }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    await userEvent.click(screen.getByLabelText(/Tôi đã kiểm tra tài khoản/));
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.action }));
    await userEvent.click(screen.getByRole('button', { name: CANCEL_COPY.confirm }));
    await waitFor(() => expect(cancelApi).toHaveBeenCalledTimes(2));
    expect(cancelApi).toHaveBeenLastCalledWith(REFERENCE, REASON, { requestedBy: 'GUEST', paymentChecked: true });
  });

  it('marks the reason as required', () => {
    panel();
    const field = screen.getByLabelText(new RegExp(CANCEL_COPY.reasonLabel)) as HTMLTextAreaElement;
    expect(field.required).toBe(true);
  });
});
