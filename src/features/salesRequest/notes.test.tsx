// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestNote } from '@/lib/api/endpoints';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

const addNoteApi = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    addNote: (...a: unknown[]) => addNoteApi(...a),
    decline: vi.fn(),
    cancel: vi.fn(),
    availabilityCheck: vi.fn(),
    win: vi.fn(),
    contact: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}));

const { InternalNotesPanel, NOTES_COPY } = await import('./InternalNotesPanel');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');
/** The removed full timeline's heading. */
const TIMELINE_COPY = { title: 'Lịch sử xử lý' } as const;

const REFERENCE = 'KAS-260912-4F7A';
const NOW = Date.parse('2026-09-01T09:00:00Z');

/** Newest first, as the API returns them. */
const NOTES: readonly SalesRequestNote[] = [
  { body: 'Guest called back, still deciding.', createdAt: '2026-09-01T10:00:00Z' },
  { body: 'Left a voicemail.', createdAt: '2026-09-01T09:00:00Z' },
];

function panel(
  notes: readonly SalesRequestNote[] = NOTES,
  failed = false,
) {
  return render(
    <InternalNotesPanel
      reference={REFERENCE}
      notes={notes}
      failed={failed}
      copy={NOTES_COPY}
    />,
  );
}

function detail(): SalesRequestDetail {
  return {
    summary: {
      reference: REFERENCE,
      salesStatus: 'REQUESTED',
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
        note: null,
        at: '2026-09-01T08:00:00Z',
      },
    ],
  };
}

function apiError(status: number, code: string, message = 'refused', details: unknown[] = []) {
  return new ApiError(status, { code, message, details: details as never, correlationId: 'c-1' });
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText(new RegExp(NOTES_COPY.label)) as HTMLTextAreaElement;
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: NOTES_COPY.action }) as HTMLButtonElement;
}

beforeEach(() => {
  addNoteApi.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});
afterEach(cleanup);

describe('rendering notes', () => {
  it('shows every note, newest first, exactly as the server ordered them', () => {
    const { container } = panel();
    const entries = within(container.querySelector('ul') as HTMLElement)
      .getAllByRole('listitem');

    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain('Guest called back, still deciding.');
    expect(entries[1]?.textContent).toContain('Left a voicemail.');
  });

  it('says plainly that notes are never shown to the guest', () => {
    panel();

    // Doc 21 §592 requires the lock and the explicit sentence; doc 21 §604 is
    // the rule it protects. Said before the agent types, not after.
    expect(screen.getByText(new RegExp(NOTES_COPY.internalOnly))).toBeTruthy();
    expect(document.body.textContent).toContain('🔒');
  });

  it('distinguishes "no notes yet" from "the notes did not load"', () => {
    panel([]);
    expect(screen.getByText(NOTES_COPY.empty)).toBeTruthy();
    cleanup();

    panel([], true);
    // Showing the empty state on a failed read would claim the team had written
    // nothing, which is a different and possibly false statement.
    expect(screen.getByText(NOTES_COPY.loadFailed)).toBeTruthy();
    expect(screen.queryByText(NOTES_COPY.empty)).toBeNull();
  });

  it('shows no author, because the API sends none', () => {
    panel();

    // app_user has no name column and doc 134 §5 leaves staff-identity
    // disclosure open. Nothing here names or hints at a person.
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/adminId|author|@|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it('renders a machine-readable timestamp per note', () => {
    const { container } = panel();
    expect(container.querySelector('time')?.getAttribute('dateTime'))
      .toBe('2026-09-01T10:00:00Z');
  });

  it('preserves an agent’s own line breaks', () => {
    const { container } = panel([
      { body: 'Line one\nLine two', createdAt: '2026-09-01T10:00:00Z' },
    ]);

    // A note is prose someone typed; collapsing its shape loses meaning.
    expect(container.querySelector('p[class*="noteBody"]')?.textContent)
      .toBe('Line one\nLine two');
  });

  it('offers no way to edit or delete — doc 58 gives this route GET and POST only', () => {
    panel();

    expect(screen.queryByRole('button', { name: /sửa|xoá|edit|delete/i })).toBeNull();
    // One button: save. Nothing per-note.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('writing a note', () => {
  it('will not submit an empty or whitespace-only note', async () => {
    panel();
    expect(saveButton().disabled).toBe(true);

    await userEvent.type(textarea(), '   ');
    expect(saveButton().disabled).toBe(true);
    expect(addNoteApi).not.toHaveBeenCalled();
  });

  it('sends the trimmed body and nothing else', async () => {
    addNoteApi.mockResolvedValue(undefined);
    panel();

    await userEvent.type(textarea(), '  Guest prefers a high floor.  ');
    await userEvent.click(saveButton());

    await waitFor(() => expect(addNoteApi).toHaveBeenCalledTimes(1));
    // The author and timestamp are the server's; the client cannot name either.
    expect(addNoteApi).toHaveBeenCalledWith(REFERENCE, 'Guest prefers a high floor.');
  });

  it('re-reads the list on success rather than appending locally', async () => {
    addNoteApi.mockResolvedValue(undefined);
    panel();

    await userEvent.type(textarea(), 'Something worth remembering.');
    await userEvent.click(saveButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toastShow).toHaveBeenCalledWith('success', NOTES_COPY.success);
    // The box is cleared only after the server accepted it.
    await waitFor(() => expect(textarea().value).toBe(''));
  });

  it('cannot submit twice while a save is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    addNoteApi.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    panel();

    await userEvent.type(textarea(), 'One note only.');
    await userEvent.click(saveButton());
    await waitFor(() => expect(addNoteApi).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole('button', { name: NOTES_COPY.submitting }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(busy);
    await userEvent.click(busy);

    expect(addNoteApi).toHaveBeenCalledTimes(1);
    release(undefined);
  });

  it('keeps what the agent typed when the save fails', async () => {
    addNoteApi.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    panel();

    await userEvent.type(textarea(), 'Do not lose this.');
    await userEvent.click(saveButton());

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    // Clearing the box on failure would discard the agent's words.
    expect(textarea().value).toBe('Do not lose this.');
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('shows the backend field message for a 400', async () => {
    addNoteApi.mockRejectedValue(apiError(400, 'VALIDATION_FAILED', 'Validation failed', [
      { field: 'body', code: 'Size', message: 'size must be between 0 and 4000' },
    ]));
    panel();

    await userEvent.type(textarea(), 'Too long, apparently.');
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(screen.getByText('size must be between 0 and 4000')).toBeTruthy(),
    );
  });

  it('maps 403 and 404 through the shared mapping, keeping them distinct', async () => {
    const { AUTH_MESSAGES } = await import('@/features/auth/messages');

    addNoteApi.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    panel();
    await userEvent.type(textarea(), 'x');
    await userEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.forbidden)).toBeTruthy());
    cleanup();

    addNoteApi.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    panel();
    await userEvent.type(textarea(), 'x');
    await userEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(AUTH_MESSAGES.notFound)).toBeTruthy());
    expect(document.body.textContent).not.toContain(AUTH_MESSAGES.forbidden);
  });

  it('handles a network failure without claiming anything was saved', async () => {
    addNoteApi.mockRejectedValue(new TypeError('Failed to fetch'));
    panel();

    await userEvent.type(textarea(), 'Offline note.');
    await userEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText(NOTES_COPY.errorNetwork)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('is reachable and operable from the keyboard', async () => {
    addNoteApi.mockResolvedValue(undefined);
    panel();

    await userEvent.tab();
    expect(document.activeElement).toBe(textarea());
    await userEvent.keyboard('Typed without a mouse.');
    await userEvent.tab();
    expect(document.activeElement).toBe(saveButton());
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(addNoteApi).toHaveBeenCalledTimes(1));
  });
});

describe('on the detail page', () => {
  it('sits apart from the status history', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} notes={NOTES} />);

    // Notes are an agent's own context, a <ul> in their own panel; the status
    // history is the page's only <ol>, in the handling column. A note is never
    // drawn as a status change.
    expect(screen.getByText(NOTES_COPY.title)).toBeTruthy();
    expect(screen.queryByText(TIMELINE_COPY.title)).toBeNull();
    expect(screen.getByText(/Guest called back/)).toBeTruthy();
    expect(document.querySelectorAll('ol')).toHaveLength(1);
    expect(document.querySelector('ol')?.textContent).not.toContain('Guest called back');
  });

  it('leaves the existing request actions intact', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} notes={NOTES} />);

    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối yêu cầu' })).toBeTruthy();
  });

  it('renders no guest-facing affordance for a note', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} notes={NOTES} />);

    // V14 keeps guest-visible messages in a separate table by design. There is
    // no send, no share and no visibility toggle here to flip.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/gửi cho khách|hiển thị cho khách|gửi tin nhắn/i);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
