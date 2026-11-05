// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  experienceTitle,
  nextSortOrder,
  swapTargets,
  swappedOrders,
  type ExperienceView,
} from '@/lib/domain/experience';
import type * as Primitives from '@/ui/primitives';

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  experiencesApi: {
    list: (...args: unknown[]) => list(...args),
    create: (...args: unknown[]) => create(...args),
    update: (...args: unknown[]) => update(...args),
    remove: (...args: unknown[]) => remove(...args),
  },
}));
vi.mock('./actions', () => ({ revalidateExperiences: () => revalidate() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PropertyExperiencesPanel } = await import('./PropertyExperiencesPanel');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';

function experience(overrides: Partial<ExperienceView> = {}): ExperienceView {
  return {
    id: 'exp-1',
    titles: { vi: 'Sân thượng lúc hoàng hôn', en: 'Rooftop at dusk' },
    descriptions: { vi: 'Giờ thành phố ngả vàng.' },
    sortOrder: 0,
    ...overrides,
  };
}

function apiError(status: number, code: string, details: { field: string; message: string }[] = []) {
  return new ApiError(status, {
    code,
    message: 'refused',
    details: details.map((d) => ({ field: d.field, code: 'INVALID', message: d.message })),
    correlationId: 'corr-1',
  });
}

afterEach(cleanup);
beforeEach(() => {
  list.mockReset();
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  refresh.mockReset();
  revalidate.mockReset();
  toastShow.mockReset();
});

describe('PropertyExperiencesPanel', () => {
  it('lists the experiences in the order the backend returned', () => {
    render(
      <PropertyExperiencesPanel
        propertyId={PROPERTY_ID}
        experiences={[
          experience({ id: 'a', titles: { vi: 'Đầu tiên' }, sortOrder: 1 }),
          experience({ id: 'b', titles: { vi: 'Thứ hai' }, sortOrder: 2 }),
        ]}
      />,
    );

    const names = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(names[0]).toContain('Đầu tiên');
    expect(names[1]).toContain('Thứ hai');
  });

  it('says what the empty state costs, because it blocks publishing', () => {
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    // Doc 52 §3.1 makes ≥1 a publish invariant, so "none yet" is not a neutral
    // state — the Partner cannot submit until they fix it, and should be told.
    // The empty state's own body is checked, not just any mention of submitting:
    // the panel intro says it too, so a loose match would pass with the empty
    // state saying nothing at all.
    expect(screen.getByText(/Khách sạn cần ít nhất một trải nghiệm đặc trưng thì mới gửi duyệt/))
      .toBeTruthy();
    expect(screen.getByText(/Chưa có trải nghiệm nào/)).toBeTruthy();
  });

  it('creates one from both locales', async () => {
    create.mockResolvedValue(experience());
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng');
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Anh\)/), 'Rooftop');
    await userEvent.type(screen.getByLabelText(/Mô tả \(tiếng Việt\)/), 'Lúc hoàng hôn.');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [propertyId, body] = create.mock.calls[0] as [string, Record<string, unknown>];
    expect(propertyId).toBe(PROPERTY_ID);
    expect(body['translations']).toEqual({
      vi: { title: 'Sân thượng', description: 'Lúc hoàng hôn.' },
      // A locale with no description sends only the title, never an empty string.
      en: { title: 'Rooftop' },
    });
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('Đã thêm'));
  });

  it('never sends timeOfDay or an image', async () => {
    create.mockResolvedValue(experience());
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const [, body] = create.mock.calls[0] as [string, Record<string, unknown>];
    // Both are out of V1 scope (Step 16A.47), and the backend rejects unknown
    // properties outright — so sending either would be a 400, not a no-op.
    expect(body).not.toHaveProperty('timeOfDay');
    expect(body).not.toHaveProperty('image');
    expect(Object.keys(body).sort()).toEqual(['sortOrder', 'translations']);
  });

  it('offers no control for the fields V1 does not carry', async () => {
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));

    expect(screen.queryByLabelText(/thời điểm|buổi|hoàng hôn trong ngày/i)).toBeNull();
    expect(screen.queryByLabelText(/ảnh|hình/i)).toBeNull();
  });

  it('will not save without a title in some locale', async () => {
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));

    // property_experience_translation.title is NOT NULL, and a titleless row
    // would still satisfy the publish gate, which counts base rows.
    const save = screen.getByRole('button', { name: 'Lưu trải nghiệm' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Anh\)/), 'Rooftop');
    expect((screen.getByRole('button', { name: 'Lưu trải nghiệm' }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('sends a description-only locale as nothing at all', async () => {
    create.mockResolvedValue(experience());
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng');
    await userEvent.type(screen.getByLabelText(/Mô tả \(tiếng Anh\)/), 'Orphan text.');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const [, body] = create.mock.calls[0] as [string, Record<string, unknown>];
    // The column is NOT NULL, so English would be refused. Dropping it here
    // keeps the save working instead of failing on a field the Partner cannot
    // see they left half-filled.
    expect(body['translations']).toEqual({ vi: { title: 'Sân thượng' } });
  });

  it('seeds the editor from the stored experience', async () => {
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[experience()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));

    expect((screen.getByLabelText(/Tên \(tiếng Việt\)/) as HTMLInputElement).value)
      .toBe('Sân thượng lúc hoàng hôn');
    expect((screen.getByLabelText(/Tên \(tiếng Anh\)/) as HTMLInputElement).value)
      .toBe('Rooftop at dusk');
    expect((screen.getByLabelText(/Mô tả \(tiếng Việt\)/) as HTMLTextAreaElement).value)
      .toBe('Giờ thành phố ngả vàng.');
  });

  it('updates an existing one', async () => {
    update.mockResolvedValue(experience());
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[experience()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await userEvent.clear(screen.getByLabelText(/Tên \(tiếng Anh\)/));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Anh\)/), 'The Rooftop');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [propertyId, id, body] = update.mock.calls[0] as
      [string, string, Record<string, unknown>];
    expect(propertyId).toBe(PROPERTY_ID);
    expect(id).toBe('exp-1');
    expect((body['translations'] as Record<string, { title: string }>)['en']?.title)
      .toBe('The Rooftop');
  });

  it('deletes one', async () => {
    remove.mockResolvedValue(undefined);
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[experience()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(PROPERTY_ID, 'exp-1'));
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('Đã xoá'));
  });

  it('reorders by swapping two sortOrders, without re-sending the words', async () => {
    update.mockResolvedValue(experience());
    render(
      <PropertyExperiencesPanel
        propertyId={PROPERTY_ID}
        experiences={[
          experience({ id: 'a', titles: { vi: 'Đầu tiên' }, sortOrder: 1 }),
          experience({ id: 'b', titles: { vi: 'Thứ hai' }, sortOrder: 2 }),
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Đưa lên trên: Thứ hai/ }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    const [, movingId, movingBody] = update.mock.calls[0] as
      [string, string, Record<string, unknown>];
    const [, otherId, otherBody] = update.mock.calls[1] as
      [string, string, Record<string, unknown>];

    expect(movingId).toBe('b');
    expect(movingBody['sortOrder']).toBe(1);
    expect(otherId).toBe('a');
    expect(otherBody['sortOrder']).toBe(2);
    // A locale the request omits keeps its stored text, so a reorder carries no
    // words at all — it cannot erase the story it is moving.
    expect(movingBody['translations']).toEqual({});
  });

  it('cannot move the ends past themselves', () => {
    render(
      <PropertyExperiencesPanel
        propertyId={PROPERTY_ID}
        experiences={[
          experience({ id: 'a', titles: { vi: 'Đầu tiên' }, sortOrder: 1 }),
          experience({ id: 'b', titles: { vi: 'Thứ hai' }, sortOrder: 2 }),
        ]}
      />,
    );

    expect((screen.getByRole('button', { name: /Đưa lên trên: Đầu tiên/ }) as HTMLButtonElement)
      .disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Đưa xuống dưới: Thứ hai/ }) as HTMLButtonElement)
      .disabled).toBe(true);
  });

  it('shows the backend refusal in the backend words', async () => {
    create.mockRejectedValue(apiError(400, 'VALIDATION_FAILED', [
      { field: 'translations.en.title', message: 'An experience title cannot be blank.' },
    ]));
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    // The message names the field and the locale; a friendlier sentence of our
    // own would hide both.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('reports a lost connection without leaking the URL', async () => {
    create.mockRejectedValue(new TypeError('fetch failed: http://backend.internal:8080'));
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không lưu được.');
    expect(alert.textContent).not.toContain('backend.internal');
  });

  it('shows a saving state and disables the actions while it runs', async () => {
    let release: (value: unknown) => void = () => {};
    create.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm trải nghiệm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trải nghiệm' }));

    const saving = await screen.findByRole('button', { name: 'Đang lưu…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);

    release(experience());
    await waitFor(() => expect(revalidate).toHaveBeenCalled());
  });

  it('never writes to browser storage', async () => {
    create.mockResolvedValue(experience());
    render(<PropertyExperiencesPanel propertyId={PROPERTY_ID} experiences={[experience()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('experience domain helpers', () => {
  it('prefers the Vietnamese title, because the console is Vietnamese', () => {
    expect(experienceTitle(experience())).toBe('Sân thượng lúc hoàng hôn');
    expect(experienceTitle(experience({ titles: { en: 'Rooftop' } }))).toBe('Rooftop');
  });

  it('returns null rather than inventing a title', () => {
    // The backend makes this impossible on create; a row like it predates the
    // API, and "no title" is the honest thing to render.
    expect(experienceTitle(experience({ titles: {} }))).toBeNull();
  });

  it('puts a new experience after the last one', () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([experience({ sortOrder: 4 })])).toBe(5);
  });

  it('finds the neighbour a move should swap with', () => {
    const items = [
      experience({ id: 'a', sortOrder: 1 }),
      experience({ id: 'b', sortOrder: 2 }),
    ];
    expect(swapTargets(items, 'b', 'up')?.other.id).toBe('a');
    expect(swapTargets(items, 'a', 'down')?.other.id).toBe('b');
    // Already at that end, or not in the list at all.
    expect(swapTargets(items, 'a', 'up')).toBeNull();
    expect(swapTargets(items, 'b', 'down')).toBeNull();
    expect(swapTargets(items, 'missing', 'up')).toBeNull();
  });

  it('nudges past a tie instead of swapping two equal orders', () => {
    const a = experience({ id: 'a', sortOrder: 0 });
    const b = experience({ id: 'b', sortOrder: 0 });

    // sort_order defaults to 0 and nothing makes it unique, so a list left at
    // the default would otherwise refuse to reorder: swapping 0 with 0 changes
    // nothing and the Partner would click and see no movement.
    expect(swappedOrders(b, a, 'up')).toEqual({ movingTo: -1, otherTo: 0 });
    expect(swappedOrders(a, b, 'down')).toEqual({ movingTo: 1, otherTo: 0 });
    expect(swappedOrders(experience({ sortOrder: 2 }), experience({ sortOrder: 1 }), 'up'))
      .toEqual({ movingTo: 1, otherTo: 2 });
  });
});
