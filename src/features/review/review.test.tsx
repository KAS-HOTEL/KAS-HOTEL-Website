// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionView } from '@/lib/domain/submission';
import type * as Primitives from '@/ui/primitives';

const approve = vi.fn();
const reject = vi.fn();
const requestChanges = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  submissionsApi: {
    approve: (...a: unknown[]) => approve(...a),
    reject: (...a: unknown[]) => reject(...a),
    requestChanges: (...a: unknown[]) => requestChanges(...a),
  },
}));
vi.mock('./actions', () => ({ revalidateReview: () => revalidate() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { DecisionPanel } = await import('./DecisionPanel');
const { ReviewQueue, waitedFor } = await import('./ReviewQueue');
const { ReviewHistory } = await import('./ReviewHistory');

const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';

function submission(overrides: Partial<SubmissionView> = {}): SubmissionView {
  return {
    id: SUBMISSION_ID,
    propertyId: PROPERTY_ID,
    status: 'SUBMITTED',
    submittedAt: '2026-09-01T03:00:00Z',
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  approve.mockReset();
  reject.mockReset();
  requestChanges.mockReset();
  refresh.mockReset();
  revalidate.mockReset();
  toastShow.mockReset();
});

describe('the decision panel', () => {
  it('offers exactly the three decisions the API exposes', () => {
    render(<DecisionPanel submission={submission()} />);

    const group = screen.getByRole('group', { name: 'Chọn quyết định' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Duyệt và công bố',
      'Yêu cầu chỉnh sửa',
      'Từ chối',
    ]);
  });

  it('says what approving actually does, because it publishes', async () => {
    render(<DecisionPanel submission={submission()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt và công bố' }));

    // Approve is one transaction that moves DRAFT → COMING_SOON and publishes
    // every room type. A confirmation that only said "are you sure?" would hide
    // the consequence that matters.
    expect(screen.getByText(/COMING_SOON/)).toBeTruthy();
    expect(screen.getByText(/danh sách công khai/)).toBeTruthy();
  });

  it('approves without a reason, because the endpoint takes none', async () => {
    approve.mockResolvedValue(submission({ status: 'APPROVED' }));
    render(<DecisionPanel submission={submission()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt và công bố' }));
    expect(screen.queryByLabelText(/Lý do/)).toBeNull();

    await userEvent.click(screen.getAllByRole('button', { name: 'Duyệt và công bố' })[1]!);

    await waitFor(() => expect(approve).toHaveBeenCalledWith(SUBMISSION_ID));
    expect(revalidate).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('will not submit a rejection until a reason is written', async () => {
    render(<DecisionPanel submission={submission()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    // `@NotBlank` on DecisionRequest and a CHECK on property_submission both
    // require it. Blocking here means the Admin is not told by a 400 what the
    // form already knew — the server stays the authority either way.
    const submit = screen.getAllByRole('button', { name: 'Từ chối' })[1]!;
    expect(submit.hasAttribute('disabled')).toBe(true);

    await userEvent.type(screen.getByLabelText(/Lý do/), 'Thiếu ảnh đại diện.');
    expect(submit.hasAttribute('disabled')).toBe(false);

    reject.mockResolvedValue(submission({ status: 'REJECTED' }));
    await userEvent.click(submit);
    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith(SUBMISSION_ID, 'Thiếu ảnh đại diện.'),
    );
  });

  it('treats whitespace as no reason at all', async () => {
    render(<DecisionPanel submission={submission()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Yêu cầu chỉnh sửa' }));
    await userEvent.type(screen.getByLabelText(/Lý do/), '   ');

    expect(
      screen.getAllByRole('button', { name: 'Yêu cầu chỉnh sửa' })[1]!.hasAttribute('disabled'),
    ).toBe(true);
    expect(requestChanges).not.toHaveBeenCalled();
  });

  it('offers a reload when another admin decided first', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    reject.mockRejectedValue(
      new ApiError(409, {
        code: 'ILLEGAL_TRANSITION',
        message: 'already decided',
        details: [],
        correlationId: 'c-1',
      }),
    );
    render(<DecisionPanel submission={submission()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await userEvent.type(screen.getByLabelText(/Lý do/), 'Không đạt.');
    await userEvent.click(screen.getAllByRole('button', { name: 'Từ chối' })[1]!);

    // The decision write is a compare-and-set on status = 'SUBMITTED', so a
    // second decision is a 409 — the one error retyping cannot fix.
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lại trạng thái mới nhất' })).toBeTruthy();
  });

  it('never puts a raw exception on screen', async () => {
    reject.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:8081'));
    render(<DecisionPanel submission={submission()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await userEvent.type(screen.getByLabelText(/Lý do/), 'Không đạt.');
    await userEvent.click(screen.getAllByRole('button', { name: 'Từ chối' })[1]!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/ECONNREFUSED|10\.0\.0\.4|8081/);
  });
});

describe('the review queue', () => {
  it('renders one row per submission, linking to its review', () => {
    render(<ReviewQueue submissions={[submission()]} now={Date.parse('2026-09-01T05:00:00Z')} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(`/admin/review/${SUBMISSION_ID}`);
    expect(link.textContent).toContain(PROPERTY_ID);
  });

  it('ages a submission against the server clock', () => {
    expect(waitedFor('2026-09-01T03:00:00Z', Date.parse('2026-09-01T05:00:00Z'))).toBe('2 giờ trước');
    expect(waitedFor('2026-09-01T03:00:00Z', Date.parse('2026-09-03T03:00:00Z'))).toBe('2 ngày trước');
  });

  it('invents no partner, reviewer or hotel name', () => {
    const { container } = render(<ReviewQueue submissions={[submission()]} now={Date.now()} />);

    // SubmissionView carries ids and timestamps. There is no partner name, no
    // reviewer name and no hotel name in it, and no endpoint resolves them.
    expect(container.textContent ?? '').not.toMatch(/đối tác:|người duyệt:|khách sạn:/i);
  });
});

describe('the review history', () => {
  it('shows an empty state rather than an empty list', () => {
    render(<ReviewHistory history={[]} />);
    expect(screen.getByText('Chưa có lịch sử')).toBeTruthy();
  });

  it('keeps every decision, including the reason', () => {
    render(
      <ReviewHistory
        history={[
          submission({
            id: 'a',
            status: 'CHANGES_REQUESTED',
            reviewedAt: '2026-09-02T04:00:00Z',
            reviewedBy: 'reviewer-1',
            decisionReason: 'Cần bổ sung ảnh.',
          }),
          submission({ id: 'b' }),
        ]}
      />,
    );

    // property_submission retains one row per submission — a resubmitted
    // property has both, and the earlier reason is what the reviewer needs.
    expect(screen.getByText('Cần bổ sung ảnh.')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the reviewer as the id the API returns, not as a name', () => {
    render(
      <ReviewHistory
        history={[
          submission({ status: 'APPROVED', reviewedAt: '2026-09-02T04:00:00Z', reviewedBy: 'u-9' }),
        ]}
      />,
    );

    expect(screen.getByText('u-9')).toBeTruthy();
  });
});
