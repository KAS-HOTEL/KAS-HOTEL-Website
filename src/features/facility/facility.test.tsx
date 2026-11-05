// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { facilityName, facilityOrder, nextSortOrder, type FacilityView } from '@/lib/domain/facility';
import type * as Primitives from '@/ui/primitives';

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const archive = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  facilitiesApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    archive: (...a: unknown[]) => archive(...a),
  },
}));
vi.mock('./actions', () => ({ revalidateFacilities: () => Promise.resolve() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PropertyFacilitiesPanel } = await import('./PropertyFacilitiesPanel');
const { loadFacilities } = await import('./load');

const PROPERTY = '11111111-1111-4111-8111-111111111111';

function facility(overrides: Partial<FacilityView> = {}): FacilityView {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    type: 'ROOFTOP',
    // Deliberately not 'Sân thượng': that is also the ROOFTOP type label, and a
    // fixture whose name equals its own type cannot tell the two apart.
    names: { vi: 'Sân thượng KAS', en: 'The KAS Rooftop' },
    descriptions: { en: 'A bar above District 1.' },
    openToNonResidents: true,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  for (const fn of [list, create, update, archive, refresh, toastShow]) {
    fn.mockReset();
  }
});

describe('the domain helpers', () => {
  it('puts live facilities before withdrawn ones', () => {
    const ordered = facilityOrder([
      facility({ id: 'a', sortOrder: 1, archived: true }),
      facility({ id: 'b', sortOrder: 5 }),
      facility({ id: 'c', sortOrder: 2 }),
    ]);

    expect(ordered.map((f) => f.id)).toEqual(['c', 'b', 'a']);
  });

  it('prefers the Vietnamese name, and says so when there is none', () => {
    expect(facilityName(facility())).toBe('Sân thượng KAS');
    expect(facilityName(facility({ names: { en: 'The KAS Rooftop' } }))).toBe('The KAS Rooftop');
    expect(facilityName(facility({ names: {} }))).toBeNull();
  });

  it('numbers a new facility past every existing one', () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([facility({ sortOrder: 0 }), facility({ sortOrder: 4 })])).toBe(5);
  });
});

describe('the loader', () => {
  it('returns the server’s facilities, ordered', async () => {
    list.mockResolvedValue([
      facility({ id: 'a', sortOrder: 1, archived: true }),
      facility({ id: 'b', sortOrder: 0 }),
    ]);

    const result = await loadFacilities(PROPERTY, 'cookie');

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.facilities.map((f) => f.id)).toEqual(['b', 'a']);
    expect(list).toHaveBeenCalledWith(PROPERTY, 'cookie');
  });

  it('does not call the backend for a malformed id', async () => {
    const result = await loadFacilities('not-a-uuid');

    expect(result).toEqual({ status: 'ok', facilities: [] });
    expect(list).not.toHaveBeenCalled();
  });

  it('surfaces a backend failure as an error', async () => {
    list.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c1',
    }));

    expect((await loadFacilities(PROPERTY)).status).toBe('error');
  });
});

describe('the panel renders server data', () => {
  it('shows each facility with its type and name', () => {
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[facility()]} />);

    const entry = screen.getByRole('listitem');
    // The name appears twice by design — once as the heading and once in the
    // per-locale breakdown, which is what tells a Partner which locales exist.
    expect(within(entry).getAllByText('Sân thượng KAS').length).toBe(2);
    // Exact match, so this is the ROOFTOP type label and not the name.
    expect(within(entry).getByText('Sân thượng')).toBeTruthy();
    expect(screen.getAllByText('Đón khách ngoài').length).toBeGreaterThan(0);
  });

  it('marks a withdrawn facility rather than hiding it', () => {
    render(
      <PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[facility({ archived: true })]} />,
    );

    // The console is where a Partner sees what they withdrew; the guest page is
    // where it disappears.
    expect(screen.getByText('Đã gỡ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gỡ khỏi trang' })).toBeNull();
  });

  it('names the locale that has no name yet', () => {
    render(
      <PropertyFacilitiesPanel
        propertyId={PROPERTY}
        facilities={[facility({ names: { vi: 'Hồ bơi' } })]}
      />,
    );

    // A guest reading English will not see this block at all, and that is what
    // the Partner needs to know.
    expect(screen.getByText('Chưa có tên')).toBeTruthy();
  });

  it('says so when the property has none', () => {
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[]} />);

    expect(screen.getByText('Chưa có tiện ích nào')).toBeTruthy();
  });
});

describe('adding a facility', () => {
  it('sends the type, the named locales, and nothing blank', async () => {
    create.mockResolvedValue(facility());
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[facility({ sortOrder: 3 })]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    await userEvent.selectOptions(screen.getByLabelText(/Loại tiện ích/), 'POOL');
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Hồ bơi');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu tiện ích' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    // The English name was left blank, so no `en` key is sent: a blank field
    // means "not written", and sending it would be refused or would overwrite.
    expect(create.mock.calls[0]).toEqual([
      PROPERTY,
      {
        type: 'POOL',
        translations: { vi: { name: 'Hồ bơi' } },
        openToNonResidents: null,
        sortOrder: 4,
      },
    ]);
  });

  it('will not save without a name in either locale', async () => {
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));

    // facility_translation.name is NOT NULL; the backend refuses it too, and a
    // disabled button says so before the round trip.
    expect(screen.getByRole('button', { name: 'Lưu tiện ích' }).hasAttribute('disabled')).toBe(true);
  });

  it('re-reads from the server rather than simulating the result', async () => {
    create.mockResolvedValue(facility());
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Hồ bơi');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu tiện ích' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('tiện ích'));
  });
});

describe('editing a facility', () => {
  it('offers no type control, because the backend ignores it', async () => {
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[facility()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));

    // A control that appeared to change the type and silently did not would be
    // worse than no control — doc 23 §5 makes the type what the block is.
    expect(screen.queryByLabelText(/Loại tiện ích \*/)).toBeNull();
    // Shown as read-only text instead — in the editor and in the list row, so
    // two matches is the correct count.
    expect(screen.getAllByText('Sân thượng')).toHaveLength(2);
  });

  it('sends the edited text to the facility’s own id', async () => {
    update.mockResolvedValue(facility());
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[facility()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await userEvent.clear(screen.getByLabelText(/Tên \(tiếng Việt\)/));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Sân thượng mới');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu tiện ích' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]?.[0]).toBe(PROPERTY);
    expect(update.mock.calls[0]?.[1]).toBe('aaaaaaaa-0000-4000-8000-000000000001');
    const body = update.mock.calls[0]?.[2] as { translations: Record<string, unknown> };
    expect(body.translations['vi']).toEqual({ name: 'Sân thượng mới' });
  });
});

describe('withdrawing a facility', () => {
  it('archives it by id', async () => {
    archive.mockResolvedValue(undefined);
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[facility()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi trang' }));

    await waitFor(() => expect(archive).toHaveBeenCalled());
    expect(archive.mock.calls[0]).toEqual([PROPERTY, 'aaaaaaaa-0000-4000-8000-000000000001']);
  });
});

describe('when the server refuses', () => {
  it('shows the refusal and does not claim success', async () => {
    create.mockRejectedValue(new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'The facility text could not be accepted.',
      details: [{ field: 'translations.en.name', code: 'REQUIRED', message: 'A facility name cannot be blank.' }],
      correlationId: 'corr-1',
    }));
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Hồ bơi');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu tiện ích' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('facility text');
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('keeps the editor open so the text can be corrected, not retyped', async () => {
    create.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c2',
    }));
    render(<PropertyFacilitiesPanel propertyId={PROPERTY} facilities={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    await userEvent.type(screen.getByLabelText(/Tên \(tiếng Việt\)/), 'Hồ bơi');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu tiện ích' }));

    await screen.findByRole('alert');
    expect((screen.getByLabelText(/Tên \(tiếng Việt\)/) as HTMLInputElement).value).toBe('Hồ bơi');
  });
});
