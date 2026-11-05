// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  allowedTransitions,
  canRequestActivation,
  newestByType,
  POLICY_STATUSES,
  POLICY_TYPES,
  policyStatusLabel,
  policyTiming,
  policyTypeLabel,
  type PolicyView,
} from '@/lib/domain/policy';
import type * as Primitives from '@/ui/primitives';

const list = vi.fn();
const create = vi.fn();
const setTranslation = vi.fn();
const setStatus = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  policiesApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    setTranslation: (...a: unknown[]) => setTranslation(...a),
    setStatus: (...a: unknown[]) => setStatus(...a),
  },
}));
vi.mock('./actions', () => ({ revalidatePolicies: (...a: unknown[]) => revalidate(...a) }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PolicyManager } = await import('./PolicyManager');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const TODAY = '2026-08-19';

function policy(overrides: Partial<PolicyView> = {}): PolicyView {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'CANCELLATION',
    version: 1,
    effectiveFrom: '2026-08-01',
    status: 'DRAFT',
    translations: {},
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  [list, create, setTranslation, setStatus, refresh, revalidate, toastShow].forEach((m) =>
    m.mockReset(),
  );
});

describe('policy domain', () => {
  it('carries exactly the eleven frozen types', () => {
    // The property_policy_type_valid CHECK. Adding one means altering a frozen
    // constraint (OQ-110), so drift must fail here.
    expect(POLICY_TYPES).toEqual([
      'BOOKING', 'CANCELLATION', 'CHILDREN', 'PETS', 'SMOKING', 'PAYMENT',
      'ACCESSIBILITY', 'PRIVACY', 'TERMS', 'COOKIES', 'NO_SHOW',
    ]);
    // The four a hotel platform would normally have, deliberately absent.
    for (const absent of ['CHECK_IN', 'CHECK_OUT', 'EXTRA_BED', 'DEPOSIT']) {
      expect(POLICY_TYPES as readonly string[]).not.toContain(absent);
    }
  });

  it('carries exactly the four frozen statuses and their transitions', () => {
    expect(POLICY_STATUSES).toEqual(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']);
    expect(allowedTransitions('DRAFT')).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(allowedTransitions('ACTIVE')).toEqual(['PAUSED', 'ARCHIVED']);
    expect(allowedTransitions('PAUSED')).toEqual(['ACTIVE', 'ARCHIVED']);
    // Terminal — and there is no DELETE anywhere.
    expect(allowedTransitions('ARCHIVED')).toEqual([]);
  });

  it('labels a paused policy as reversible and an archived one as retained', () => {
    expect(policyStatusLabel('PAUSED')).toBe('Tạm ngưng áp dụng');
    expect(policyStatusLabel('ARCHIVED')).toBe('Đã lưu trữ');
    expect(policyStatusLabel('ARCHIVED')).not.toMatch(/xoá|xóa/i);
    expect(policyTypeLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('never calls a future-dated ACTIVE version current', () => {
    // effective_from can be in the future; "ACTIVE" alone does not mean applying.
    expect(policyTiming(policy({ status: 'ACTIVE', effectiveFrom: '2026-08-01' }), TODAY))
      .toBe('current');
    expect(policyTiming(policy({ status: 'ACTIVE', effectiveFrom: '2026-12-01' }), TODAY))
      .toBe('scheduled');
    expect(policyTiming(policy({ status: 'DRAFT', effectiveFrom: '2020-01-01' }), TODAY))
      .toBe('inactive');
  });

  it('mirrors the backend activation gate — both locales', () => {
    expect(canRequestActivation(policy({ translations: { vi: 'a', en: 'b' } }))).toBe(true);
    expect(canRequestActivation(policy({ translations: { vi: 'a' } }))).toBe(false);
    // Blank is not content — the backend counts non-blank bodies.
    expect(canRequestActivation(policy({ translations: { vi: 'a', en: '   ' } }))).toBe(false);
  });

  it('picks the newest version by effective date then version, like the backend', () => {
    const older = policy({ id: 'a', effectiveFrom: '2026-01-01', version: 9 });
    const newer = policy({ id: 'b', effectiveFrom: '2026-06-01', version: 1 });
    expect(newestByType([older, newer]).get('CANCELLATION')?.id).toBe('b');

    const v1 = policy({ id: 'c', effectiveFrom: '2026-06-01', version: 1 });
    const v2 = policy({ id: 'd', effectiveFrom: '2026-06-01', version: 2 });
    expect(newestByType([v1, v2]).get('CANCELLATION')?.id).toBe('d');
  });
});

const manager = (policies: PolicyView[]) => (
  <PolicyManager propertyId={PROPERTY_ID} policies={policies} today={TODAY} />
);

describe('PolicyManager', () => {
  it('lists all eleven types even when none is configured', () => {
    render(manager([]));
    // By their Vietnamese names. The raw constant was printed in mono under
    // each one — which is what this assertion used to find — and a database
    // value shown to a hotelier is not a label.
    for (const type of POLICY_TYPES) {
      expect(screen.getByText(policyTypeLabel(type))).toBeTruthy();
      expect(screen.queryByText(type)).toBeNull();
    }
    expect(screen.getAllByText('Chưa cấu hình')).toHaveLength(11);
  });

  it('shows a deliberate empty state, not an error', () => {
    render(manager([]));

    // Both facts still stated — that nothing is configured, and how to start.
    // They are now one lead paragraph above the list rather than an EmptyState
    // card: the list is never empty (all eleven types are always rendered with
    // their own "Tạo bản nháp"), so a card announcing emptiness sat directly
    // above eleven rows contradicting it. Same information, honest hierarchy.
    expect(screen.getByText(/Chưa có chính sách nào được thiết lập/)).toBeTruthy();
    expect(screen.getByText(/giúp khách hiểu rõ điều kiện lưu trú/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    // And the rows that resolve it are present, which is what makes the
    // paragraph the right shape rather than a card.
    expect(screen.getAllByRole('button', { name: 'Tạo bản nháp' }).length).toBeGreaterThan(0);
  });

  it('invents no policy text and no commercial value', () => {
    const { container } = render(manager([]));
    const text = container.textContent ?? '';
    // No cancellation window, child age, pet fee, deposit or percentage may
    // appear: property_policy has no numeric columns and doc 51 records these as
    // unresolved business inputs.
    expect(text).not.toMatch(/\d+\s*(giờ|ngày|%|tuổi|VND)/);
    expect(text).not.toMatch(/miễn phí|phụ thu|đặt cọc|hoàn tiền/i);
  });

  it('summarises a configured policy with its version, date and locale state', () => {
    render(manager([policy({ status: 'ACTIVE', translations: { vi: 'Nội dung' } })]));

    const row = screen.getByText('Huỷ đặt phòng').closest('li') as HTMLElement;
    expect(within(row).getByText('Đang áp dụng')).toBeTruthy();
    expect(within(row).getByText('Đang có hiệu lực')).toBeTruthy();
    expect(within(row).getByText(/Bản 1 · từ 2026-08-01/)).toBeTruthy();
    expect(within(row).getByText('VI đã có')).toBeTruthy();
    expect(within(row).getByText('EN chưa có')).toBeTruthy();
  });

  it('keeps the raw backend status alongside the translation', () => {
    const { container } = render(manager([policy({ status: 'PAUSED' })]));
    expect(container.querySelector('[data-policy-status="PAUSED"]')).toBeTruthy();
  });

  it('creates a draft through the real API, dated today', async () => {
    create.mockResolvedValue(policy({ type: 'PETS' }));
    render(manager([]));

    const petsRow = screen.getByText('Thú cưng').closest('li') as HTMLElement;
    await userEvent.click(within(petsRow).getByRole('button', { name: 'Tạo bản nháp' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(PROPERTY_ID, {
      type: 'PETS',
      effectiveFrom: TODAY,
    }));
    expect(revalidate).toHaveBeenCalledWith(PROPERTY_ID);
  });

  it('filters by status without hiding the frozen catalogue silently', async () => {
    render(manager([policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } })]));

    await userEvent.click(screen.getByRole('button', { name: 'Đang áp dụng' }));
    expect(screen.getAllByText('Huỷ đặt phòng')).toHaveLength(1);
    expect(screen.queryByText('Thú cưng')).toBeNull();
  });

  it('offers a filter for every state a policy can be in', async () => {
    render(manager([policy()]));

    // PAUSED was missing from this row while being one of the four. A partner
    // who paused a policy had no way to list what they had paused.
    for (const status of POLICY_STATUSES) {
      expect(screen.getByRole('button', { name: policyStatusLabel(status) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Tất cả' })).toBeTruthy();
  });

  it('narrows to the paused policies, and only those', async () => {
    render(
      manager([
        policy({ type: 'CANCELLATION', status: 'PAUSED', translations: { vi: 'a', en: 'b' } }),
        policy({
          id: '33333333-3333-4333-8333-333333333333',
          type: 'PETS',
          status: 'ACTIVE',
          translations: { vi: 'a', en: 'b' },
        }),
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Tạm ngưng áp dụng' }));

    expect(screen.getAllByText('Huỷ đặt phòng')).toHaveLength(1);
    expect(screen.queryByText('Thú cưng')).toBeNull();
  });

  it('explains a filter that matches nothing instead of rendering a blank area', async () => {
    render(manager([policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } })]));

    await userEvent.click(screen.getByRole('button', { name: 'Tạm ngưng áp dụng' }));

    // Nothing is paused, which is the ordinary state. A blank page under the
    // tabs cannot be told apart from a screen that failed to load.
    expect(screen.getByText(/Không có chính sách nào ở trạng thái/)).toBeTruthy();
    expect(screen.getByText(/Toàn bộ 11 loại chính sách vẫn còn nguyên/)).toBeTruthy();

    // And the way back is one click, not a hunt along the tab strip.
    await userEvent.click(screen.getByRole('button', { name: 'Xem tất cả' }));
    expect(screen.getAllByText('Huỷ đặt phòng')).toHaveLength(1);
  });
});

describe('policy editor', () => {
  const open = async (p: PolicyView) => {
    render(manager([p]));
    await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
  };

  it('edits both locales, one request per locale', async () => {
    setTranslation.mockResolvedValue(policy({ translations: { vi: 'Nội dung VI' } }));
    await open(policy());

    await userEvent.type(screen.getByLabelText(/Nội dung tiếng Việt/), 'Nội dung VI');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nội dung VI' }));

    await waitFor(() => expect(setTranslation).toHaveBeenCalled());
    const [, , body] = setTranslation.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(body['locale']).toBe('vi');
    expect(body['body']).toBe('Nội dung VI');
    // summary is never sent: the API accepts it and never reads it back (OQ-143),
    // so an input for it would show a value that is not the stored one.
    expect(body).not.toHaveProperty('summary');
  });

  it('seeds each locale from the DTO and marks a missing one', async () => {
    await open(policy({ translations: { vi: 'Đã có' } }));
    expect((screen.getByLabelText(/Nội dung tiếng Việt/) as HTMLTextAreaElement).value)
      .toBe('Đã có');
    expect((screen.getByLabelText(/Nội dung tiếng Anh/) as HTMLTextAreaElement).value).toBe('');
  });

  it('blocks activation until both locales have content, and says why', async () => {
    await open(policy({ translations: { vi: 'Chỉ tiếng Việt' } }));

    const activate = screen.getByRole('button', { name: 'Đưa vào áp dụng' });
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Cần nội dung ở cả tiếng Việt và tiếng Anh/)).toBeTruthy();
  });

  it('allows activation once both locales exist', async () => {
    setStatus.mockResolvedValue(policy({ status: 'ACTIVE' }));
    await open(policy({ translations: { vi: 'a', en: 'b' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào áp dụng' }));
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(PROPERTY_ID, expect.any(String), 'ACTIVE'),
    );
  });

  it('offers only transitions the backend accepts', async () => {
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));
    // ACTIVE → PAUSED | ARCHIVED. Never back to DRAFT, never a delete. The
    // controls are verbs, so they cannot be confused with the status filters.
    expect(screen.getByRole('button', { name: 'Tạm ngưng' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xoá|Chuyển về nháp/ })).toBeNull();
  });

  it('names its actions as verbs, so no two controls share an accessible name', async () => {
    await open(policy({ translations: { vi: 'a', en: 'b' } }));
    // "Đang áp dụng" is a status filter; the control that performs the
    // transition is "Đưa vào áp dụng". One name, one meaning.
    expect(screen.getAllByRole('button', { name: 'Đang áp dụng' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Đưa vào áp dụng' })).toHaveLength(1);
  });

  it('asks before archiving, and says the change cannot be undone', async () => {
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    // Nothing has been sent yet. `allowedTransitions('ARCHIVED')` is empty, so
    // this click used to be a single, silent, irreversible step.
    expect(setStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/Không thể khôi phục/)).toBeTruthy();
    // And the reversible alternative is named, because it is what most people
    // reaching for "Lưu trữ" actually want.
    expect(screen.getByText(/hãy chọn “Tạm ngưng” thay vì/)).toBeTruthy();
  });

  it('archives only after the confirmation is accepted', async () => {
    setStatus.mockResolvedValue(policy({ status: 'ARCHIVED' }));
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ vĩnh viễn' }));

    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(PROPERTY_ID, expect.any(String), 'ARCHIVED'),
    );
  });

  it('sends nothing when the confirmation is declined', async () => {
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Giữ nguyên' }));

    expect(setStatus).not.toHaveBeenCalled();
    expect(screen.queryByText(/Không thể khôi phục/)).toBeNull();
  });

  it('does not ask before the reversible transitions', async () => {
    setStatus.mockResolvedValue(policy({ status: 'PAUSED' }));
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Tạm ngưng' }));

    // Confirmation fatigue is real: a dialog on the transitions that can simply
    // be undone teaches an operator to click through the one that cannot.
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(PROPERTY_ID, expect.any(String), 'PAUSED'),
    );
    expect(screen.queryByText(/Không thể khôi phục/)).toBeNull();
  });

  it('offers nothing on an archived policy, and explains why it is kept', async () => {
    await open(policy({ status: 'ARCHIVED' }));
    expect(screen.getByText(/có thể đã gắn với đơn đặt phòng/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đưa vào áp dụng' })).toBeNull();
  });

  it('states the public-visibility ladder rather than implying active means visible', async () => {
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));
    expect(
      screen.getByText(/khách sạn đã công khai, chính sách đang áp dụng và ngày hiệu lực đã tới/),
    ).toBeTruthy();
  });

  it('reports a conflict without overwriting', async () => {
    setStatus.mockRejectedValue(
      new ApiError(409, { code: 'VERSION_CONFLICT', message: 'x', details: [], correlationId: null }),
    );
    await open(policy({ translations: { vi: 'a', en: 'b' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào áp dụng' }));

    expect((await screen.findAllByRole('alert'))[0]?.textContent)
      .toContain('Thông tin đã thay đổi');
  });

  it('reports a refused activation with the backend’s own message', async () => {
    setTranslation.mockRejectedValue(
      new ApiError(400, {
        code: 'VALIDATION_FAILED',
        message: 'Policy text is required in both locales before this policy can be activated.',
        details: [{ field: 'body', code: 'REQUIRED', message: 'Provide policy text.' }],
        correlationId: null,
      }),
    );
    await open(policy());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nội dung VI' }));

    expect((await screen.findAllByRole('alert'))[0]?.textContent)
      .toContain('Policy text is required in both locales');
  });

  it('reports an unreachable backend without leaking the exception', async () => {
    setTranslation.mockRejectedValue(new TypeError('fetch failed to http://internal-host:8080'));
    await open(policy());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nội dung VI' }));

    const alert = (await screen.findAllByRole('alert'))[0];
    expect(alert?.textContent).toContain('Không thể kết nối');
    expect(alert?.textContent).not.toContain('internal-host');
  });

  it('writes nothing to web storage', async () => {
    setTranslation.mockResolvedValue(policy());
    await open(policy());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nội dung VI' }));

    await waitFor(() => expect(setTranslation).toHaveBeenCalled());
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

// ------------------------------------------------------------ drawer shape

describe('the policy drawer', () => {
  const open = async (p: PolicyView) => {
    render(manager([p]));
    await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
  };

  it('offers a way out of every state, archived included', async () => {
    await open(policy({ status: 'ARCHIVED' }));

    // An archived policy has no legal transition, so before this the drawer's
    // only exits were the header icon, Escape and a backdrop click — none of
    // which looks like an action. A terminal state still needs a button.
    //
    // It shares its name with the header's close icon, which is the one case
    // where two controls may: they are the same action, so a screen reader
    // announcing "Đóng, button" twice is not being told about two things.
    const footer = screen.getByRole('dialog').querySelector('footer') as HTMLElement;
    await userEvent.click(within(footer).getByRole('button', { name: 'Đóng' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    // Closing is not a lifecycle change.
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('never offers an archived policy a way back', async () => {
    await open(policy({ status: 'ARCHIVED', translations: { vi: 'a', en: 'b' } }));

    // Even with both locales present — the activation gate is satisfied and
    // the transition is still illegal, because a reservation's terms_version
    // may point at this row.
    expect(screen.queryByRole('button', { name: 'Đưa vào áp dụng' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tạm ngưng' })).toBeNull();
    expect(screen.getByText(/không thể áp dụng lại/)).toBeTruthy();
  });

  it('groups every action in the dialog footer, below the content', async () => {
    await open(policy({ status: 'PAUSED', translations: { vi: 'a', en: 'b' } }));

    const dialog = screen.getByRole('dialog');
    const footer = dialog.querySelector('footer') as HTMLElement;
    const names = within(footer)
      .getAllByRole('button')
      .map((button) => button.textContent);

    // Archiving is destructive, so it sits left of the constructive action
    // rather than against the edge a hand reaches for.
    // A paused policy is being put back, not put into effect for the first
    // time, and the label says so.
    expect(names).toEqual(['Đóng', 'Lưu trữ', 'Đưa vào áp dụng lại']);
  });

  it('shows no raw backend value anywhere the partner can read one', async () => {
    await open(policy({ status: 'PAUSED', translations: { vi: 'a', en: 'b' } }));

    const dialog = screen.getByRole('dialog');
    // "Đang áp dụng (ACTIVE)" and a mono "CANCELLATION" were both on screen.
    expect(dialog.textContent).not.toMatch(/PAUSED|ACTIVE|ARCHIVED|CANCELLATION|DRAFT/);
    expect(within(dialog).getByText('Tạm ngưng áp dụng')).toBeTruthy();
    // The attribute is kept: it is a selector, not a label.
    expect(document.querySelector('[data-policy-status="PAUSED"]')).toBeTruthy();
  });

  it('explains one thing at a time', async () => {
    // Three notes could stack: the archived explanation, the activation gate
    // and the standing visibility paragraph. Only the one that applies here.
    await open(policy({ translations: { vi: 'Chỉ tiếng Việt' } }));

    expect(screen.getByText(/Cần nội dung ở cả tiếng Việt và tiếng Anh/)).toBeTruthy();
    expect(screen.queryByText(/khách sạn đã công khai/)).toBeNull();
    expect(screen.queryByText(/không thể áp dụng lại/)).toBeNull();
  });

  it('states the version and the effective date without labelling them', async () => {
    await open(policy({ status: 'ACTIVE', translations: { vi: 'a', en: 'b' } }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Bản 1 · hiệu lực từ 2026-08-01/)).toBeTruthy();
    // The definition list those three values used to sit in is gone.
    expect(dialog.querySelector('dl')).toBeNull();
  });
});

// -------------------------------------------------------- putting into effect

describe('putting a policy into effect', () => {
  const open = async (p: PolicyView) => {
    render(manager([p]));
    await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
  };

  const ready = { vi: 'Nội dung', en: 'Content' };

  it('offers "Đưa vào áp dụng" on a draft, and sends the real transition', async () => {
    setStatus.mockResolvedValue(policy({ status: 'ACTIVE', translations: ready }));
    await open(policy({ status: 'DRAFT', translations: ready }));

    const activate = screen.getByRole('button', { name: 'Đưa vào áp dụng' });
    expect((activate as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(activate);

    // PATCH …/policies/{id}/status?status=ACTIVE — the existing contract, not
    // a new one, and not a local state flip pretending to have succeeded.
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(PROPERTY_ID, expect.any(String), 'ACTIVE'),
    );
  });

  it('offers "Đưa vào áp dụng lại" on a paused policy', async () => {
    setStatus.mockResolvedValue(policy({ status: 'ACTIVE', translations: ready }));
    await open(policy({ status: 'PAUSED', translations: ready }));

    // Same transition, same endpoint; the word a partner who withdrew this
    // last month is looking for is "lại".
    expect(screen.queryByRole('button', { name: 'Đưa vào áp dụng' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào áp dụng lại' }));

    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(PROPERTY_ID, expect.any(String), 'ACTIVE'),
    );
  });

  it('offers no activation on a policy already in effect', async () => {
    await open(policy({ status: 'ACTIVE', translations: ready }));

    // ACTIVE → PAUSED | ARCHIVED. `canTransitionTo` refuses same-state, so an
    // activate button here would be a 409 with a friendly label on it.
    expect(screen.queryByRole('button', { name: /Đưa vào áp dụng/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tạm ngưng' })).toBeTruthy();
  });

  it('offers no activation on an archived policy', async () => {
    await open(policy({ status: 'ARCHIVED', translations: ready }));

    expect(screen.queryByRole('button', { name: /Đưa vào áp dụng/ })).toBeNull();
  });

  it('refreshes from the server after a successful activation', async () => {
    setStatus.mockResolvedValue(policy({ status: 'ACTIVE', translations: ready }));
    await open(policy({ status: 'DRAFT', translations: ready }));

    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào áp dụng' }));

    await waitFor(() => expect(revalidate).toHaveBeenCalledWith(PROPERTY_ID));
    // The server owns the new state; nothing is painted from the click alone.
    expect(refresh).toHaveBeenCalled();
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringMatching(/./));
  });

  it('shows the backend own refusal, and changes nothing', async () => {
    setStatus.mockRejectedValue(
      new ApiError(400, {
        code: 'VALIDATION_FAILED',
        message: 'Policy text is required in both locales before this policy can be activated.',
        details: [{ field: 'body', code: 'REQUIRED', message: "Provide policy text for 'en' and 'vi'." }],
        correlationId: null,
      }),
    );
    await open(policy({ status: 'DRAFT', translations: ready }));

    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào áp dụng' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/both locales/);
    // No optimistic success: the drawer still shows a draft.
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalledWith('success', expect.anything());
  });
});
