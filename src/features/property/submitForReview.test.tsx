// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import type { SubmissionView } from '@/lib/domain/submission';
import type * as Primitives from '@/ui/primitives';

const submit = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  submissionsApi: { submit: (...a: unknown[]) => submit(...a) },
}));
vi.mock('./actions', () => ({ revalidateProperties: () => revalidate() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { SubmitForReviewPanel } = await import('./SubmitForReviewPanel');

const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';

function property(overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
    id: PROPERTY_ID,
    slug: 'hotel-7',
    names: { vi: 'Khách sạn Số 7' },
    lifecycleState: 'DRAFT',
    isFlagship: false,
    version: 3,
    ...overrides,
  } as PropertyAdminView;
}

/** A completeness result with exactly the given missing fields. */
function completeness(...missing: string[]): PropertyCompleteness {
  return {
    sections: [{ key: 'information', label: 'Thông tin', missing }],
  } as unknown as PropertyCompleteness;
}

function submission(overrides: Partial<SubmissionView> = {}): SubmissionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    propertyId: PROPERTY_ID,
    status: 'SUBMITTED',
    submittedAt: '2026-09-01T03:00:00Z',
    ...overrides,
  };
}

function panel(props: Partial<Parameters<typeof SubmitForReviewPanel>[0]> = {}) {
  return render(
    <SubmitForReviewPanel
      property={property()}
      completeness={completeness()}
      history={[]}
      {...props}
    />,
  );
}

afterEach(cleanup);
beforeEach(() => {
  for (const fn of [submit, refresh, revalidate, toastShow]) {
    fn.mockReset();
  }
});

describe('sending a property for review', () => {
  it('asks before submitting, because there is no way to withdraw', async () => {
    panel();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    // No un-submit endpoint exists, so the consequence is named before the act.
    expect(screen.getByText(/không thể thu hồi/)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('says what approval will do, because it publishes', async () => {
    panel();

    // Approve moves DRAFT → COMING_SOON and publishes every room type in one
    // transaction. A Partner should read that before submitting, not after —
    // in the same words the status badges use, rather than the raw enum this
    // sentence used to print mid-Vietnamese.
    expect(screen.getByText(/Sắp khai trương/)).toBeTruthy();
    expect(screen.getByText(/danh sách công khai/)).toBeTruthy();
    expect(screen.queryByText(/COMING_SOON/)).toBeNull();
  });

  it('submits the property id and nothing else', async () => {
    submit.mockResolvedValue(submission());
    panel();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    // The trigger is replaced by the confirmation, so this is the same name
    // on the button that actually sends.
    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    // The endpoint takes no body: the actor and the scope come from the session.
    await waitFor(() => expect(submit).toHaveBeenCalledWith(PROPERTY_ID));
    expect(revalidate).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('can be abandoned at the confirmation', async () => {
    panel();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(screen.queryByText(/không thể thu hồi/)).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('what blocks the button', () => {
  it('will not offer to submit an incomplete property', () => {
    panel({ completeness: completeness('Địa chỉ', 'Ảnh đại diện') });

    expect((screen.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // The server's own list, rendered verbatim — this panel computes no rule of
    // its own, so it cannot disagree with the endpoint it calls.
    expect(screen.getByText('Địa chỉ')).toBeTruthy();
    expect(screen.getByText('Ảnh đại diện')).toBeTruthy();
  });

  it('does not claim a property is ready when the checklist could not be read', () => {
    panel({ completeness: null });

    // Null is "we could not ask", which is not the same as "nothing is missing".
    expect((screen.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/Không tải được tiến độ/)).toBeTruthy();
  });

  it('offers no second submit while one is open', () => {
    panel({ history: [submission({ status: 'SUBMITTED' })] });

    // One open submission per property — the V22 partial unique index. A second
    // attempt is a 409, so the button is not offered at all.
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).toBeNull();
    expect(screen.getByText(/đang chờ duyệt/)).toBeTruthy();
  });

  it('offers no cancel, because no endpoint withdraws a submission', () => {
    panel({ history: [submission({ status: 'SUBMITTED' })] });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not ask an already-approved property to submit again', () => {
    panel({
      property: property({ lifecycleState: 'COMING_SOON' }),
      history: [submission({ status: 'APPROVED', reviewedAt: '2026-09-02T04:00:00Z' })],
    });

    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).toBeNull();

    // The state is still stated — as the badge every other surface uses. This
    // line used to read "Trạng thái hiện tại: COMING_SOON" while the header two
    // panels above called the same state "Sắp khai trương".
    expect(screen.getByText('Sắp khai trương')).toBeTruthy();
    // And the raw value stays recoverable, so a bug report can still name it.
    expect(document.querySelector('[data-lifecycle-state="COMING_SOON"]')).toBeTruthy();
  });
});

describe('after a decision', () => {
  it('shows the reviewer’s reason, which is what to fix before resubmitting', () => {
    panel({
      history: [
        submission({
          status: 'CHANGES_REQUESTED',
          reviewedAt: '2026-09-02T04:00:00Z',
          decisionReason: 'Cần bổ sung ảnh đại diện.',
        }),
      ],
    });

    expect(screen.getByText('Cần bổ sung ảnh đại diện.')).toBeTruthy();
    expect(screen.getByText(/Yêu cầu chỉnh sửa/)).toBeTruthy();
    // A property sent back is DRAFT again and may be resubmitted.
    expect(screen.getByRole('button', { name: 'Gửi duyệt' })).toBeTruthy();
  });

  it('keeps every field the server refuses on, not just the first', async () => {
    submit.mockRejectedValue(
      new ApiError(400, {
        code: 'VALIDATION_FAILED',
        message: 'This property is not yet complete enough to submit.',
        details: [
          { field: 'heroImage', code: 'REQUIRED', message: 'Required before submitting.' },
          { field: 'address', code: 'REQUIRED', message: 'Required before submitting.' },
        ],
        correlationId: 'c-1',
      }),
    );
    panel();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    // The trigger is replaced by the confirmation, so this is the same name
    // on the button that actually sends.
    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    // The backend reports every unmet item at once so the Partner can fix them
    // in one pass; collapsing that to a single sentence would throw it away.
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('heroImage')).toBeTruthy();
    expect(screen.getByText('address')).toBeTruthy();
  });

  it('never puts a raw exception on screen', async () => {
    submit.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:8080'));
    panel();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    // The trigger is replaced by the confirmation, so this is the same name
    // on the button that actually sends.
    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/ECONNREFUSED|10\.0\.0\.4|8080/);
  });
});
