// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import type { SubmissionView } from '@/lib/domain/submission';
import type * as Primitives from '@/ui/primitives';

const propertyList = vi.fn();
const completeness = vi.fn();
const publish = vi.fn();
const covers = vi.fn();
const queue = vi.fn();
const approve = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: {
    list: (...a: unknown[]) => propertyList(...a),
    completeness: (...a: unknown[]) => completeness(...a),
    publish: (...a: unknown[]) => publish(...a),
  },
  submissionsApi: {
    queue: (...a: unknown[]) => queue(...a),
    approve: (...a: unknown[]) => approve(...a),
  },
  mediaApi: { covers: (...a: unknown[]) => covers(...a) },
}));

vi.mock('./actions', () => ({
  revalidateProperties: vi.fn(),
  revalidatePublishing: (...a: unknown[]) => revalidate(...a),
}));

vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { loadPublishingBoard } = await import('./publishing');
const { PublishingBoard } = await import('./PublishingBoard');

const ELEGANCE = '11111111-1111-4111-8111-111111111111';
const PASSION = '22222222-2222-4222-8222-222222222222';
const SUBMISSION = '33333333-3333-4333-8333-333333333333';

function property(overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
    id: ELEGANCE,
    slug: 'kas-elegance-hotel',
    names: { vi: 'Kas Elegance Hotel', en: 'Kas Elegance Hotel' },
    signatureLines: {},
    shortDescriptions: {},
    lifecycleState: 'COMING_SOON',
    isFlagship: false,
    district: 'Phường Bến Thành',
    ward: null,
    city: 'Thành phố Hồ Chí Minh',
    phone: null,
    latitude: null,
    longitude: null,
    sortOrder: 0,
    amenityCodes: [],
    tripIntentCodes: [],
    version: 4,
    ...overrides,
  } as PropertyAdminView;
}

function complete(missing: readonly string[] = []): PropertyCompleteness {
  return {
    complete: missing.length === 0,
    sections: [{ name: 'Basic information', complete: missing.length === 0, missing }],
  };
}

function submission(overrides: Partial<SubmissionView> = {}): SubmissionView {
  return {
    id: SUBMISSION,
    propertyId: PASSION,
    status: 'SUBMITTED',
    submittedAt: '2026-09-10T02:00:00Z',
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  [propertyList, completeness, publish, covers, queue, approve, refresh, revalidate, toastShow]
    .forEach((m) => m.mockReset());
  covers.mockResolvedValue([]);
  queue.mockResolvedValue([]);
  completeness.mockResolvedValue(complete());
});

// ------------------------------------------------------------------ loading

describe('loading the publishing board', () => {
  it('asks for a checklist only where an action could use one', async () => {
    propertyList.mockResolvedValue([
      property({ id: ELEGANCE, lifecycleState: 'OPEN' }),
      property({ id: PASSION, lifecycleState: 'DRAFT' }),
    ]);

    const board = await loadPublishingBoard('cookie');

    // An OPEN hotel has no transition on this screen, so a round trip for a
    // checklist that gates nothing is a request for a fact nobody can act on.
    expect(completeness).toHaveBeenCalledTimes(1);
    expect(completeness).toHaveBeenCalledWith(PASSION, 'cookie');
    expect(board.status).toBe('ok');
  });

  it('matches each open submission to the property it belongs to', async () => {
    propertyList.mockResolvedValue([property({ id: PASSION, lifecycleState: 'DRAFT' })]);
    queue.mockResolvedValue([submission()]);

    const board = await loadPublishingBoard();
    if (board.status !== 'ok') throw new Error('expected ok');

    expect(board.rows[0]?.openSubmissionId).toBe(SUBMISSION);
    expect(board.queueUnavailable).toBe(false);
  });

  it('keeps a failed queue read distinct from an empty queue', async () => {
    propertyList.mockResolvedValue([property({ id: PASSION, lifecycleState: 'DRAFT' })]);
    queue.mockRejectedValue(new Error('down'));

    const board = await loadPublishingBoard();
    if (board.status !== 'ok') throw new Error('expected ok');

    // Otherwise a backend fault renders as "the partner never submitted it",
    // which is a different fact and the wrong one to act on.
    expect(board.queueUnavailable).toBe(true);
    expect(board.rows[0]?.openSubmissionId).toBeNull();
  });

  it('renders the board even when no cover can be read', async () => {
    propertyList.mockResolvedValue([property()]);
    covers.mockRejectedValue(new Error('down'));

    const board = await loadPublishingBoard();
    if (board.status !== 'ok') throw new Error('expected ok');

    expect(board.coversUnavailable).toBe(true);
    expect(board.rows).toHaveLength(1);
  });

  it('treats a failed property list as fatal, and nothing else as fatal', async () => {
    propertyList.mockRejectedValue(
      new ApiError(500, { code: 'INTERNAL_ERROR', message: 'x', details: [], correlationId: null }),
    );

    expect((await loadPublishingBoard()).status).toBe('error');
  });
});

// -------------------------------------------------------------------- board

describe('the publishing board', () => {
  const board = (rows: Awaited<ReturnType<typeof rowsFor>>) =>
    render(<PublishingBoard rows={rows} coversUnavailable={false} queueUnavailable={false} />);

  async function rowsFor(properties: PropertyAdminView[], open: SubmissionView[] = []) {
    propertyList.mockResolvedValue(properties);
    queue.mockResolvedValue(open);
    const result = await loadPublishingBoard();
    if (result.status !== 'ok') throw new Error('expected ok');
    return result.rows;
  }

  it('names the hotel and where it is, never its slug or its id', async () => {
    board(await rowsFor([property()]));

    expect(screen.getByText('Kas Elegance Hotel')).toBeTruthy();
    expect(screen.getByText('Phường Bến Thành · Thành phố Hồ Chí Minh')).toBeTruthy();
    // A uuid and a slug address this hotel in the API and say nothing to the
    // person deciding whether to put it on the website.
    expect(document.body.textContent).not.toMatch(/kas-elegance-hotel|1111-4111/);
  });

  it('translates the lifecycle rather than printing the enum', async () => {
    board(await rowsFor([property({ lifecycleState: 'COMING_SOON' })]));

    expect(screen.getByText('Sắp khai trương')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/COMING_SOON|DRAFT|OPEN/);
  });

  it('offers approval only when a submission is actually open', async () => {
    board(await rowsFor([property({ id: PASSION, lifecycleState: 'DRAFT' })]));

    // `approve` needs a submission id. Without one the call is a 404, so the
    // row says what is missing instead of offering a button that cannot work.
    expect(screen.queryByRole('button', { name: 'Duyệt hồ sơ' })).toBeNull();
    expect(screen.getByText(/đối tác chưa gửi duyệt/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở hồ sơ khách sạn' })).toBeTruthy();
  });

  it('approves through the real endpoint and re-reads the server', async () => {
    approve.mockResolvedValue(submission({ status: 'APPROVED' }));
    board(
      await rowsFor(
        [property({ id: PASSION, lifecycleState: 'DRAFT' })],
        [submission({ propertyId: PASSION })],
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt hồ sơ' }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith(SUBMISSION));
    expect(revalidate).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('publishes with the version the server gave it', async () => {
    publish.mockResolvedValue(property({ lifecycleState: 'OPEN' }));
    board(await rowsFor([property({ lifecycleState: 'COMING_SOON', version: 4 })]));

    await userEvent.click(screen.getByRole('button', { name: 'Mở bán' }));

    // Doc 58 §2: publishing over an edit the operator never saw is exactly
    // what the concurrency token exists to prevent.
    await waitFor(() => expect(publish).toHaveBeenCalledWith(ELEGANCE, { version: 4 }));
  });

  it('offers no action on a hotel that is already open', async () => {
    board(await rowsFor([property({ lifecycleState: 'OPEN' })]));

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Khách có thể xem và đặt phòng')).toBeTruthy();
  });

  it('will not publish a hotel the backend checklist rejects', async () => {
    completeness.mockResolvedValue(complete(['hero image', 'signatureLine']));
    board(await rowsFor([property({ lifecycleState: 'COMING_SOON' })]));

    expect((screen.getByRole('button', { name: 'Mở bán' }) as HTMLButtonElement).disabled)
      .toBe(true);
    // The server's own field names, verbatim — the same strings a refused
    // publish puts in its details[], so the two can be matched up.
    expect(screen.getByText('hero image')).toBeTruthy();
    expect(screen.getByText('signatureLine')).toBeTruthy();
  });

  it('stays clickable when the checklist itself could not be read', async () => {
    completeness.mockRejectedValue(new Error('down'));
    board(await rowsFor([property({ lifecycleState: 'COMING_SOON' })]));

    // Guessing "not ready" from a failed read would block a hotel that is in
    // fact publishable. The backend refuses it if it is wrong.
    expect((screen.getByRole('button', { name: 'Mở bán' }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('reports a refusal in the backend own words, against the row that caused it', async () => {
    publish.mockRejectedValue(
      new ApiError(400, {
        code: 'VALIDATION_FAILED',
        message: 'This property is not yet complete enough to publish.',
        details: [
          {
            field: 'at least one published room type',
            code: 'REQUIRED',
            message: "Room types are published when the property's submission is approved.",
          },
        ],
        correlationId: null,
      }),
    );
    board(await rowsFor([property({ lifecycleState: 'COMING_SOON' })]));

    await userEvent.click(screen.getByRole('button', { name: 'Mở bán' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/not yet complete enough to publish/)).toBeTruthy();
    // The explanation as well as the field: it says how to clear the blocker.
    expect(within(alert).getByText(/submission is approved/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not claim a hotel was never submitted when the queue failed', async () => {
    propertyList.mockResolvedValue([property({ id: PASSION, lifecycleState: 'DRAFT' })]);
    queue.mockRejectedValue(new Error('down'));
    const result = await loadPublishingBoard();
    if (result.status !== 'ok') throw new Error('expected ok');

    render(
      <PublishingBoard rows={result.rows} coversUnavailable={false} queueUnavailable />,
    );

    expect(screen.getByText(/chưa đọc được hàng đợi duyệt/)).toBeTruthy();
    expect(screen.queryByText(/đối tác chưa gửi duyệt/)).toBeNull();
  });
});
