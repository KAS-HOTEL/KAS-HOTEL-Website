// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

const contactApi = vi.fn();
const winApi = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    contact: (...a: unknown[]) => contactApi(...a),
    win: (...a: unknown[]) => winApi(...a),
    decline: vi.fn(),
    cancel: vi.fn(),
    availabilityCheck: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}));

const { ContactLogPanel, CONTACT_COPY } = await import('./ContactLogPanel');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

const REFERENCE = 'KAS-260912-4F7A';
const NOW = Date.parse('2026-09-01T09:00:00Z');

function detail(salesStatus = 'AVAILABILITY_CHECK'): SalesRequestDetail {
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
  return render(<ContactLogPanel reference={REFERENCE} copy={CONTACT_COPY} />);
}

function apiError(status: number, code: string, message = 'refused', details: unknown[] = []) {
  return new ApiError(status, { code, message, details: details as never, correlationId: 'c-1' });
}

function actionButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: CONTACT_COPY.action }) as HTMLButtonElement;
}

async function chooseChannel(label: string): Promise<void> {
  await userEvent.selectOptions(
    screen.getByLabelText(new RegExp(CONTACT_COPY.channelLabel)),
    screen.getByRole('option', { name: label }),
  );
}

beforeEach(() => {
  contactApi.mockReset();
  winApi.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});
afterEach(cleanup);

describe('contact log — the form', () => {
  it('cannot be submitted until a channel is chosen', async () => {
    panel();
    // Direction defaults to OUTBOUND — the common case — but channel does not,
    // because guessing it would record a fact nobody supplied.
    expect(actionButton().disabled).toBe(true);

    await chooseChannel(CONTACT_COPY.channels.PHONE);
    expect(actionButton().disabled).toBe(false);
    expect(contactApi).not.toHaveBeenCalled();
  });

  it('offers exactly the contact_channel and contact_direction enum values', () => {
    panel();
    const channel = screen.getByLabelText(new RegExp(CONTACT_COPY.channelLabel));
    const direction = screen.getByLabelText(new RegExp(CONTACT_COPY.directionLabel));

    const values = (select: HTMLElement) =>
      Array.from((select as HTMLSelectElement).options)
        .map((o) => o.value)
        .filter((v) => v !== '');

    expect(values(channel)).toEqual(['PHONE', 'ZALO', 'EMAIL', 'SMS', 'IN_PERSON']);
    expect(values(direction)).toEqual(['OUTBOUND', 'INBOUND']);
  });

  it('offers no outcome vocabulary — the column is free text', () => {
    panel();
    const outcome = screen.getByLabelText(new RegExp(CONTACT_COPY.outcomeLabel));
    // An input, not a select: no frozen document enumerates outcomes, so none
    // are invented here.
    expect(outcome.tagName).toBe('INPUT');
  });

  it('offers no timestamp or agent field', () => {
    panel();
    // The server takes both from the column default and the session. Offering
    // either would let an agent log a conversation at a time it did not happen.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/thời điểm|nhân viên|người ghi nhận/i);
    expect(document.querySelectorAll('input[type="datetime-local"], input[type="date"]'))
      .toHaveLength(0);
  });
});

describe('contact log — the call', () => {
  it('sends exactly the four documented fields', async () => {
    contactApi.mockResolvedValue(undefined);
    panel();
    await chooseChannel(CONTACT_COPY.channels.ZALO);
    await userEvent.type(
      screen.getByLabelText(new RegExp(CONTACT_COPY.outcomeLabel)),
      'Khách sẽ xác nhận tối nay',
    );
    await userEvent.type(
      screen.getByLabelText(new RegExp(CONTACT_COPY.notesLabel)),
      'Gọi lúc 10h',
    );

    await userEvent.click(actionButton());

    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));
    expect(contactApi).toHaveBeenCalledWith(REFERENCE, {
      channel: 'ZALO',
      direction: 'OUTBOUND',
      outcome: 'Khách sẽ xác nhận tối nay',
      notes: 'Gọi lúc 10h',
    });
  });

  it('sends null, not an empty string, for the optional fields', async () => {
    contactApi.mockResolvedValue(undefined);
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    // Whitespace is not an outcome. The columns are nullable, and a blank string
    // would record that an agent typed nothing rather than that there was nothing.
    await userEvent.type(screen.getByLabelText(new RegExp(CONTACT_COPY.outcomeLabel)), '   ');

    await userEvent.click(actionButton());

    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));
    expect(contactApi).toHaveBeenCalledWith(REFERENCE, {
      channel: 'PHONE',
      direction: 'OUTBOUND',
      outcome: null,
      notes: null,
    });
  });

  it('sends the chosen direction, not the default', async () => {
    contactApi.mockResolvedValue(undefined);
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.selectOptions(
      screen.getByLabelText(new RegExp(CONTACT_COPY.directionLabel)),
      screen.getByRole('option', { name: CONTACT_COPY.directions.INBOUND }),
    );

    await userEvent.click(actionButton());

    await waitFor(() =>
      expect(contactApi).toHaveBeenCalledWith(
        REFERENCE,
        expect.objectContaining({ direction: 'INBOUND' }),
      ),
    );
  });

  it('needs no confirmation — it releases nothing and moves no rooms', async () => {
    contactApi.mockResolvedValue(undefined);
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);

    // One click, unlike the win and the two terminal panels.
    await userEvent.click(actionButton());
    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a busy state and cannot be submitted twice', async () => {
    let release: (value: unknown) => void = () => {};
    contactApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());
    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole('button', { name: CONTACT_COPY.submitting }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(busy);
    await userEvent.click(busy);
    expect(contactApi).toHaveBeenCalledTimes(1);

    release(undefined);
  });

  it('repeated keyboard activation still produces exactly one request', async () => {
    let release: (value: unknown) => void = () => {};
    contactApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);

    actionButton().focus();
    await userEvent.keyboard('{Enter}{Enter}{Enter}');

    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));
    expect(contactApi).toHaveBeenCalledTimes(1);
    release(undefined);
  });

  it('keeps what the agent typed while submitting', async () => {
    let release: (value: unknown) => void = () => {};
    contactApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.type(screen.getByLabelText(new RegExp(CONTACT_COPY.notesLabel)), 'Đang gọi');
    await userEvent.click(actionButton());
    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));

    const notes = screen.getByLabelText(
      new RegExp(CONTACT_COPY.notesLabel),
    ) as HTMLTextAreaElement;
    expect(notes.value).toBe('Đang gọi');
    expect(notes.disabled).toBe(true);
    release(undefined);
  });
});

describe('contact log — success and refusals', () => {
  it('re-reads the record on 204 and reports it', async () => {
    contactApi.mockResolvedValue(undefined);
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toastShow).toHaveBeenCalledWith('success', CONTACT_COPY.success);
  });

  it('never claims the new status before the server has been re-read', async () => {
    let release: (value: unknown) => void = () => {};
    contactApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { container } = panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());
    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));

    expect(container.textContent).not.toContain(CONTACT_COPY.success);
    expect(refresh).not.toHaveBeenCalled();
    release(undefined);
  });

  it('treats 409 as "no longer in a state that accepts a contact"', async () => {
    contactApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(screen.getByText(CONTACT_COPY.errorAlreadyMoved)).toBeTruthy());
    expect(contactApi).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
    expect(CONTACT_COPY.errorAlreadyMoved).toMatch(/tải lại/);
  });

  it('shows the backend field message for a 400', async () => {
    contactApi.mockRejectedValue(apiError(400, 'VALIDATION_FAILED', 'Validation failed', [
      { field: 'channel', code: 'Pattern', message: 'must match "PHONE|EMAIL|ZALO|SMS|IN_PERSON"' },
    ]));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() =>
      expect(screen.getByText(/must match "PHONE\|EMAIL/)).toBeTruthy(),
    );
  });

  it('falls back to its own wording when a 400 names no field', async () => {
    contactApi.mockRejectedValue(apiError(400, 'VALIDATION_FAILED', 'Validation failed'));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(screen.getByText(CONTACT_COPY.errorInvalid)).toBeTruthy());
  });

  it('keeps 404 distinct from 403', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');

    contactApi.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.notFound)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain(AUTH_MESSAGES.forbidden);
    cleanup();

    contactApi.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.forbidden)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain(AUTH_MESSAGES.notFound);
  });

  it('renders 401 as an expired session', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');
    contactApi.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.expired)).toBeTruthy());
  });

  it('handles a network failure and stays retryable', async () => {
    contactApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(screen.getByText(CONTACT_COPY.errorNetwork)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
    expect(actionButton().disabled).toBe(false);
  });

  it('leaks no internal backend text for a 500', async () => {
    contactApi.mockRejectedValue(
      apiError(500, 'INTERNAL_ERROR', 'org.postgresql.util.PSQLException: contact_channel'),
    );
    panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/PSQLException|org\.postgresql/);
  });

  it('announces the failure once, in a live region', async () => {
    contactApi.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION'));
    const { container } = panel();
    await chooseChannel(CONTACT_COPY.channels.PHONE);
    await userEvent.click(actionButton());

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain(CONTACT_COPY.errorAlreadyMoved);
  });

  it('says no notification is sent', () => {
    panel();
    expect(screen.getByText(CONTACT_COPY.noNotification)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/đã gửi email|email sent/i);
  });
});

describe('detail view — where contact is offered', () => {
  it('is no longer drawn on the request page (removed at the hotel\'s request)', () => {
    for (const status of ['ASSIGNED', 'AVAILABILITY_CHECK']) {
      render(<SalesRequestDetailView request={detail(status)} now={NOW} />);
      expect(screen.queryByRole('button', { name: CONTACT_COPY.action })).toBeNull();
      expect(screen.queryByText('Ghi nhận liên hệ')).toBeNull();
      cleanup();
    }
  });

  it('is not offered from REQUESTED', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);
    expect(screen.queryByRole('button', { name: CONTACT_COPY.action })).toBeNull();
  });

  it('is not offered again once the request is CUSTOMER_CONTACTED', () => {
    render(<SalesRequestDetailView request={detail('CUSTOMER_CONTACTED')} now={NOW} />);

    // Doc 54 has no CUSTOMER_CONTACTED → CUSTOMER_CONTACTED row.
    expect(screen.queryByRole('button', { name: CONTACT_COPY.action })).toBeNull();
    // But the request is now winnable, which is what the contact achieved.
    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
  });

  it('is not offered in any terminal state', () => {
    for (const terminal of ['WON', 'DECLINED', 'CANCELLED', 'EXPIRED']) {
      render(<SalesRequestDetailView request={detail(terminal)} now={NOW} />);
      expect(screen.queryByRole('button', { name: CONTACT_COPY.action })).toBeNull();
      cleanup();
    }
  });

  it('leaves manual approval in place at AVAILABILITY_CHECK', () => {
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);
    expect(screen.queryByRole('button', { name: CONTACT_COPY.action })).toBeNull();
    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
  });

  it('exposes no internal identifier', () => {
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);
    expect(document.body.innerHTML).not.toMatch(
      /reservationId|holdId|partnerId|salesOwnerId|admin_id|contacted_at/i,
    );
  });
});

describe('accessibility', () => {
  it('labels every control and marks the required ones', () => {
    panel();
    const channel = screen.getByLabelText(
      new RegExp(CONTACT_COPY.channelLabel),
    ) as HTMLSelectElement;
    const direction = screen.getByLabelText(
      new RegExp(CONTACT_COPY.directionLabel),
    ) as HTMLSelectElement;

    expect(channel.required).toBe(true);
    expect(direction.required).toBe(true);
    // Optional exactly where the columns are nullable.
    expect((screen.getByLabelText(new RegExp(CONTACT_COPY.outcomeLabel)) as HTMLInputElement)
      .required).toBe(false);
    expect((screen.getByLabelText(new RegExp(CONTACT_COPY.notesLabel)) as HTMLTextAreaElement)
      .required).toBe(false);
  });

  it('can be completed from the keyboard alone', async () => {
    contactApi.mockResolvedValue(undefined);
    panel();

    const channel = screen.getByLabelText(
      new RegExp(CONTACT_COPY.channelLabel),
    ) as HTMLSelectElement;
    channel.focus();
    await userEvent.selectOptions(channel, 'PHONE');

    actionButton().focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(contactApi).toHaveBeenCalledTimes(1));
  });
});
