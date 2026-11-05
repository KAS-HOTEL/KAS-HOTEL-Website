// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  landmarkDistanceLabel,
  landmarkName,
  nextSortOrder,
  type LandmarkView,
} from '@/lib/domain/landmark';
import type * as Primitives from '@/ui/primitives';

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  landmarksApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));
vi.mock('./actions', () => ({ revalidateLandmarks: () => Promise.resolve() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PropertyLandmarksPanel } = await import('./PropertyLandmarksPanel');
const { loadLandmarks } = await import('./load');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const LANDMARK = 'aaaaaaaa-0000-4000-8000-000000000001';

function landmark(overrides: Partial<LandmarkView> = {}): LandmarkView {
  return {
    id: LANDMARK,
    type: 'MARKET',
    names: { vi: 'Chợ Bến Thành', en: 'Ben Thanh Market' },
    descriptions: { en: "The city's oldest market." },
    distanceMetres: 500,
    walkingMinutes: 6,
    sortOrder: 0,
    ...overrides,
  };
}

afterEach(cleanup);
// Block body: an expression arrow returns the mock, and Vitest calls a value
// returned from `beforeEach` as a teardown.
beforeEach(() => {
  for (const fn of [list, create, update, remove, refresh, toastShow]) {
    fn.mockReset();
  }
});

describe('the domain helpers', () => {
  it('prefers the Vietnamese name, and says so when there is none', () => {
    expect(landmarkName(landmark())).toBe('Chợ Bến Thành');
    expect(landmarkName(landmark({ names: { en: 'Ben Thanh Market' } }))).toBe('Ben Thanh Market');
    expect(landmarkName(landmark({ names: {} }))).toBeNull();
  });

  it('writes metres below a kilometre and kilometres above it', () => {
    expect(landmarkDistanceLabel(landmark({ walkingMinutes: null }))).toBe('500 m');
    expect(
      landmarkDistanceLabel(landmark({ walkingMinutes: null, distanceMetres: 1200 })),
    ).toBe('1.2 km');
  });

  it('shows both measures when the hotel supplied both', () => {
    expect(landmarkDistanceLabel(landmark())).toBe('6 phút đi bộ · 500 m');
  });

  it('derives neither measure from the other', () => {
    // 500 metres does not become "6 minutes". Doc 03 §5.2 wants verified times.
    expect(landmarkDistanceLabel(landmark({ walkingMinutes: null }))).toBe('500 m');
    expect(landmarkDistanceLabel(landmark({ distanceMetres: null }))).toBe('6 phút đi bộ');
    expect(
      landmarkDistanceLabel(landmark({ distanceMetres: null, walkingMinutes: null })),
    ).toBeNull();
  });

  it('numbers a new landmark past every existing one', () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([landmark({ sortOrder: 0 }), landmark({ sortOrder: 4 })])).toBe(5);
  });
});

describe('the loader', () => {
  it('returns what the backend served, in its order', async () => {
    list.mockResolvedValue([landmark({ id: 'a' }), landmark({ id: 'b' })]);

    const result = await loadLandmarks(PROPERTY, 'cookie');

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Nothing re-sorts by distance here.
    expect(result.landmarks.map((l) => l.id)).toEqual(['a', 'b']);
    expect(list).toHaveBeenCalledWith(PROPERTY, 'cookie');
  });

  it('does not call the backend for a malformed id', async () => {
    expect(await loadLandmarks('not-a-uuid')).toEqual({ status: 'ok', landmarks: [] });
    expect(list).not.toHaveBeenCalled();
  });

  it('surfaces a backend failure as an error', async () => {
    list.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c1',
    }));

    expect((await loadLandmarks(PROPERTY)).status).toBe('error');
  });
});

describe('the panel renders server data', () => {
  it('shows the name and the measured distance', () => {
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[landmark()]} />);

    const entry = screen.getByRole('listitem');
    expect(within(entry).getAllByText('Chợ Bến Thành').length).toBeGreaterThan(0);
    expect(within(entry).getByText('6 phút đi bộ · 500 m')).toBeTruthy();
  });

  it('says "not measured" rather than showing a zero', () => {
    render(
      <PropertyLandmarksPanel
        propertyId={PROPERTY}
        landmarks={[landmark({ distanceMetres: null, walkingMinutes: null })]}
      />,
    );

    // Doc 03 §5.2 wants verified distances, so an unmeasured landmark says so.
    expect(screen.getByText('Chưa đo')).toBeTruthy();
    expect(screen.queryByText(/0 m/)).toBeNull();
  });

  it('names the locale that has no name yet', () => {
    render(
      <PropertyLandmarksPanel
        propertyId={PROPERTY}
        landmarks={[landmark({ names: { vi: 'Chợ Bến Thành' } })]}
      />,
    );

    // A guest reading English will not see this landmark at all.
    expect(screen.getByText('Chưa có tên')).toBeTruthy();
  });

  it('says so when the property has none', () => {
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    expect(screen.getByText('Chưa có địa điểm nào')).toBeTruthy();
  });
});

describe('adding a landmark', () => {
  it('sends the named locales and the measures as numbers', async () => {
    create.mockResolvedValue(landmark());
    render(
      <PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[landmark({ sortOrder: 2 })]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Chợ Bến Thành');
    await userEvent.type(screen.getByLabelText(/Thời gian đi bộ/), '6');
    await userEvent.type(screen.getByLabelText(/Khoảng cách/), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu địa điểm' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]).toEqual([
      PROPERTY,
      {
        type: null,
        translations: { vi: { name: 'Chợ Bến Thành' } },
        distanceMetres: 500,
        walkingMinutes: 6,
        sortOrder: 3,
      },
    ]);
  });

  it('sends an unmeasured field as null, never as zero', async () => {
    create.mockResolvedValue(landmark());
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Bờ sông');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu địa điểm' }));

    // "Not measured" and "zero metres away" are different claims.
    await waitFor(() => expect(create).toHaveBeenCalled());
    const body = create.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body['distanceMetres']).toBeNull();
    expect(body['walkingMinutes']).toBeNull();
  });

  it('refuses a negative measurement before the round trip', async () => {
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));
    await userEvent.type(screen.getByLabelText(/Khoảng cách/), '-50');

    // The field strips anything that is not a digit, so the schema's
    // non-negative check is never reached with a bad value.
    expect((screen.getByLabelText(/Khoảng cách/) as HTMLInputElement).value).toBe('50');
  });

  it('will not save without a name in either locale', async () => {
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));

    expect(screen.getByRole('button', { name: 'Lưu địa điểm' }).hasAttribute('disabled')).toBe(true);
  });

  it('re-reads from the server rather than simulating the result', async () => {
    create.mockResolvedValue(landmark());
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Bờ sông');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu địa điểm' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('địa điểm'));
  });
});

describe('editing and removing', () => {
  it('sends the edit to the landmark’s own id', async () => {
    update.mockResolvedValue(landmark());
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[landmark()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await userEvent.clear(screen.getByLabelText(/Tên \(tiếng Việt\)/));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Chợ mới');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu địa điểm' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]?.[0]).toBe(PROPERTY);
    expect(update.mock.calls[0]?.[1]).toBe(LANDMARK);
  });

  it('loads the stored measures into the editor', async () => {
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[landmark()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));

    expect((screen.getByLabelText(/Khoảng cách/) as HTMLInputElement).value).toBe('500');
    expect((screen.getByLabelText(/Thời gian đi bộ/) as HTMLInputElement).value).toBe('6');
  });

  it('deletes by id', async () => {
    remove.mockResolvedValue(undefined);
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[landmark()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(remove.mock.calls[0]).toEqual([PROPERTY, LANDMARK]);
  });
});

describe('when the server refuses', () => {
  it('shows the refusal and does not claim success', async () => {
    create.mockRejectedValue(new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'The landmark text could not be accepted.',
      details: [{ field: 'translations.en.name', code: 'REQUIRED', message: 'Blank.' }],
      correlationId: 'corr-1',
    }));
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Chợ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu địa điểm' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('landmark text');
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('keeps the editor open so the text can be corrected, not retyped', async () => {
    create.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c2',
    }));
    render(<PropertyLandmarksPanel propertyId={PROPERTY} landmarks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Chợ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu địa điểm' }));

    await screen.findByRole('alert');
    expect((screen.getByLabelText(/Tên \(tiếng Việt\)/) as HTMLInputElement).value).toBe('Chợ');
  });
});
