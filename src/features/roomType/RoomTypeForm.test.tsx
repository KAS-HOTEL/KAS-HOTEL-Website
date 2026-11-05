// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { AmenityCatalogEntry, RoomTypeView } from '@/lib/domain/roomType';
import type * as Primitives from '@/ui/primitives';

const create = vi.fn();
const update = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/lib/api/endpoints', () => ({
  roomTypesApi: {
    create: (...args: unknown[]) => create(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));
vi.mock('./actions', () => ({ revalidateRoomTypes: (...a: unknown[]) => revalidate(...a) }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { RoomTypeForm } = await import('./RoomTypeForm');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';

const amenities: AmenityCatalogEntry[] = [
  { code: 'wifi', category: 'CONNECTIVITY', names: {}, isHighlight: true, sortOrder: 0 },
  { code: 'bathtub', category: 'BATHROOM', names: { vi: 'Bồn tắm' }, isHighlight: false, sortOrder: 1 },
  // The backend refuses this category on a room type, so it must not be offered.
  { code: 'pool', category: 'PROPERTY_FACILITY', names: {}, isHighlight: false, sortOrder: 2 },
];

const existing: RoomTypeView = {
  id: ROOM_ID,
  slug: 'deluxe-king',
  translations: {
    vi: { name: 'Phòng Deluxe', shortDescription: 'Rộng rãi' },
    en: { name: 'Deluxe Room' },
  },
  status: 'DRAFT',
  areaSqm: 32,
  maxAdults: 2,
  maxChildren: 1,
  maxOccupancy: 3,
  viewType: 'CITY',
  smoking: false,
  sortOrder: 0,
  beds: [{ bedType: 'King', bedCount: 1, isDefault: true, sortOrder: 0 }],
  amenityCodes: ['wifi'],
  version: 4,
};

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
  create.mockReset();
  update.mockReset();
  push.mockReset();
  refresh.mockReset();
  revalidate.mockReset();
  toastShow.mockReset();
});

const createForm = () => <RoomTypeForm propertyId={PROPERTY_ID} amenities={amenities} />;
const editForm = () => (
  <RoomTypeForm propertyId={PROPERTY_ID} roomType={existing} amenities={amenities} />
);

describe('create form', () => {
  it('renders every field the write contract accepts, and no others', () => {
    render(createForm());

    for (const label of [
      'Định danh',
      'Tên tiếng Việt',
      'Tên tiếng Anh',
      'Mô tả ngắn \\(VI\\)',
      'Mô tả ngắn \\(EN\\)',
      'Người lớn',
      'Trẻ em',
      'Sức chứa tối đa',
      'Diện tích',
      'Hướng nhìn',
      'Hút thuốc',
    ]) {
      expect(screen.getByLabelText(new RegExp(label))).toBeTruthy();
    }

    // No price, no room count, no room number, no inventory — none of those is
    // on RoomTypeRequest, and a field here could only be invented.
    expect(screen.queryByLabelText(/giá|price|số phòng|tồn kho/i)).toBeNull();
  });

  it('offers exactly the five frozen view types', () => {
    render(createForm());
    const options = within(screen.getByLabelText(/Hướng nhìn/) as HTMLSelectElement)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '');

    // Doc 94: the enum was deliberately not extended. GARDEN and LANDMARK are
    // exactly the values the phase brief forbids inventing.
    expect(options).toEqual(['CITY', 'STREET', 'COURTYARD', 'ROOFTOP', 'INTERIOR']);
  });

  it('shows no status section and no publish control when creating', () => {
    render(createForm());
    expect(screen.queryByText(/Trạng thái hiện tại/)).toBeNull();
    expect(screen.queryByRole('button', { name: /đăng|publish/i })).toBeNull();
  });

  it('requires a slug and at least one name before asking the server', async () => {
    render(createForm());
    await userEvent.click(screen.getByRole('button', { name: 'Tạo loại phòng' }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Bắt buộc.')).toBeTruthy();
    expect(screen.getByText('Cần tên ở ít nhất một ngôn ngữ.')).toBeTruthy();
  });

  it('sends only the locales that were filled in', async () => {
    create.mockResolvedValue({ ...existing, id: 'new-id' });
    render(createForm());

    await userEvent.type(screen.getByLabelText(/Định danh/), 'suite');
    await userEvent.type(screen.getByLabelText(/Tên tiếng Việt/), 'Phòng Suite');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo loại phòng' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [propertyId, body] = create.mock.calls[0] as [string, Record<string, unknown>];
    expect(propertyId).toBe(PROPERTY_ID);
    // Copying the Vietnamese name into `en` would make the missing English name
    // impossible to see — which is the OQ-138 failure mode in reverse.
    expect(body['translations']).toEqual({ vi: { name: 'Phòng Suite' } });
  });

  it('sends bed rows with exactly the three keys the write contract defines', async () => {
    create.mockResolvedValue({ ...existing, id: 'new-id' });
    render(createForm());

    await userEvent.type(screen.getByLabelText(/Định danh/), 'suite');
    await userEvent.type(screen.getByLabelText(/Tên tiếng Việt/), 'Phòng Suite');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm giường' }));
    await userEvent.type(screen.getByLabelText(/Loại giường/), 'King');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo loại phòng' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [, body] = create.mock.calls[0] as [string, Record<string, unknown>];
    const beds = body['beds'] as Record<string, unknown>[];

    // `BedConfigurationRequest` has three components; the server derives the
    // order from this array. A fourth key is not merely ignored —
    // `fail-on-unknown-properties` is on, so it rejects the entire body with
    // 400 "The request body could not be read". Sending `sortOrder` here is
    // what made every real create and edit fail.
    expect(Object.keys(beds[0] ?? {}).sort()).toEqual(['bedCount', 'bedType', 'isDefault']);
  });

  it('navigates to the id the API returned, never to a guessed one', async () => {
    create.mockResolvedValue({ ...existing, id: 'server-assigned-id' });
    render(createForm());

    await userEvent.type(screen.getByLabelText(/Định danh/), 'suite');
    await userEvent.type(screen.getByLabelText(/Tên tiếng Việt/), 'Phòng Suite');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo loại phòng' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/partner/properties/${PROPERTY_ID}/rooms/server-assigned-id`,
      ),
    );
    expect(revalidate).toHaveBeenCalledWith(PROPERTY_ID);
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('Đã tạo'));
  });
});

describe('bilingual authoring', () => {
  it('seeds both locales from the DTO', () => {
    render(editForm());
    expect((screen.getByLabelText(/Tên tiếng Việt/) as HTMLInputElement).value)
      .toBe('Phòng Deluxe');
    expect((screen.getByLabelText(/Tên tiếng Anh/) as HTMLInputElement).value)
      .toBe('Deluxe Room');
    expect((screen.getByLabelText(/Mô tả ngắn \(VI\)/) as HTMLInputElement).value)
      .toBe('Rộng rãi');
  });

  it('sends a changed Vietnamese name — the OQ-138 regression', async () => {
    update.mockResolvedValue({ ...existing, version: 5 });
    render(editForm());

    const vi = screen.getByLabelText(/Tên tiếng Việt/);
    await userEvent.clear(vi);
    await userEvent.type(vi, 'Phòng Đã Đổi Tên');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, , , body] = update.mock.calls[0] as [string, string, number, Record<string, unknown>];
    const translations = body['translations'] as Record<string, { name: string } | undefined>;
    // The backend used to write this to `en`, so the Vietnamese edit vanished.
    expect(translations['vi']?.name).toBe('Phòng Đã Đổi Tên');
    expect(translations['en']?.name).toBe('Deluxe Room');
  });

  it('maps a per-locale field error onto the input that owns it', async () => {
    update.mockRejectedValue(
      apiError(400, 'VALIDATION_FAILED', [
        { field: 'translations.fr', message: 'Supported locales are vi and en.' },
      ]),
    );
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Tên tiếng Việt/).getAttribute('aria-invalid')).toBe('true'),
    );
  });
});

describe('bed configuration', () => {
  it('adds and removes rows without imposing a vocabulary', async () => {
    render(createForm());

    await userEvent.click(screen.getByRole('button', { name: 'Thêm giường' }));
    const bedType = screen.getByLabelText(/Loại giường/);
    // Free text, not a select: there is no bed catalogue in the frozen schema.
    expect(bedType.tagName).toBe('INPUT');

    await userEvent.click(screen.getByRole('button', { name: 'Thêm giường' }));
    expect(screen.getAllByLabelText(/Loại giường/)).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Xoá cấu hình giường 2' }));
    expect(screen.getAllByLabelText(/Loại giường/)).toHaveLength(1);
  });

  it('refuses a bed row with no type', async () => {
    render(createForm());
    await userEvent.type(screen.getByLabelText(/Định danh/), 'suite');
    await userEvent.type(screen.getByLabelText(/Tên tiếng Việt/), 'Phòng');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm giường' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tạo loại phòng' }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Mỗi dòng giường cần một loại giường.')).toBeTruthy();
  });

  it('keeps exactly one default bed', async () => {
    update.mockResolvedValue({ ...existing, version: 5 });
    render(editForm());

    await userEvent.click(screen.getByRole('button', { name: 'Thêm giường' }));
    const defaults = screen.getAllByRole('button', { name: 'Mặc định' });
    await userEvent.click(defaults[1] as HTMLElement);

    expect(
      screen.getAllByRole('button', { name: 'Mặc định' })
        .filter((b) => b.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
  });
});

describe('amenities', () => {
  it('offers the backend catalogue, grouped, and never a frontend list', () => {
    render(createForm());
    expect(screen.getByRole('checkbox', { name: /wifi/ })).toBeTruthy();
    // The label comes from the catalogue when it has one, the code when it does not.
    expect(screen.getByRole('checkbox', { name: /Bồn tắm/ })).toBeTruthy();
    expect(screen.getByText('Kết nối')).toBeTruthy();
  });

  it('never offers a property-level facility on a room', () => {
    render(createForm());
    // RoomTypeService refuses PROPERTY_FACILITY on a room type, so offering it
    // would be offering a save that cannot succeed.
    expect(screen.queryByRole('checkbox', { name: /pool/ })).toBeNull();
  });

  it('keeps a code the catalogue no longer offers instead of dropping it', () => {
    render(
      <RoomTypeForm
        propertyId={PROPERTY_ID}
        roomType={{ ...existing, amenityCodes: ['wifi', 'retired-code'] }}
        amenities={amenities}
      />,
    );
    // Silently dropping it would strip an assignment the Partner never touched.
    expect(screen.getByText(/retired-code/)).toBeTruthy();
  });

  it('shows the backend’s amenity rejection verbatim', async () => {
    update.mockRejectedValue(
      apiError(400, 'VALIDATION_FAILED', [
        { field: 'amenityCodes', message: "'nope' is not in the amenity catalog." },
      ]),
    );
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText("'nope' is not in the amenity catalog.")).toBeTruthy();
  });

  it('still lets the rest of the form work when the catalogue fails to load', () => {
    render(
      <RoomTypeForm
        propertyId={PROPERTY_ID}
        amenities={[]}
        amenityError="Không thể kết nối tới hệ thống."
      />,
    );
    expect(screen.getByLabelText(/Tên tiếng Việt/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Không thể kết nối');
  });
});

describe('edit form', () => {
  it('sends the version it was given, as a separate argument', async () => {
    update.mockResolvedValue({ ...existing, version: 5 });
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [propertyId, roomTypeId, version] = update.mock.calls[0] as [string, string, number];
    expect(propertyId).toBe(PROPERTY_ID);
    expect(roomTypeId).toBe(ROOM_ID);
    // The room-type contract takes it as a query parameter (OQ-139), not in the body.
    expect(version).toBe(4);
  });

  it('adopts the version from the response so the next save is not a conflict', async () => {
    update.mockResolvedValue({ ...existing, version: 5 });
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    update.mockResolvedValue({ ...existing, version: 6 });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect((update.mock.calls[1] as [string, string, number])[2]).toBe(5);
  });

  it('offers a reload on a stale version rather than only describing it', async () => {
    update.mockRejectedValue(apiError(409, 'VERSION_CONFLICT'));
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Thông tin đã thay đổi');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại thông tin mới nhất' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('recovers from a stale version when the refreshed record arrives', async () => {
    update.mockRejectedValue(apiError(409, 'VERSION_CONFLICT'));
    const { rerender } = render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    // What  produces: the same component, a newer record.
    // Asserting that refresh was *called* — which the test above does — says
    // nothing about whether the editor adopted anything. This is the assertion
    // that was missing: the reload button is useless if the form goes on
    // holding the version the server has already moved past.
    rerender(
      <RoomTypeForm
        propertyId={PROPERTY_ID}
        roomType={{
          ...existing,
          version: 9,
          translations: { vi: { name: 'Phòng Deluxe mới' }, en: { name: 'Deluxe Renamed' } },
        }}
        amenities={amenities}
      />,
    );

    // The conflict is cleared, not merely re-described.
    expect(screen.queryByRole('alert')).toBeNull();
    // And the server’s current values are on screen, which is what the button
    // labelled “Tải lại thông tin mới nhất” promises.
    expect(screen.getByLabelText<HTMLInputElement>('Tên tiếng Việt').value).toBe(
      'Phòng Deluxe mới',
    );

    // The retry now carries the version the server actually holds, so it is not
    // rejected for the same reason a second time.
    update.mockReset();
    update.mockResolvedValue({ ...existing, version: 10 });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect((update.mock.calls[0] as [string, string, number])[2]).toBe(9);
  });

  it('does not wipe a half-written new room when nothing changed upstream', async () => {
    const { rerender } = render(createForm());
    await userEvent.type(screen.getByLabelText(/Định danh/), 'garden-suite');

    // A re-render while creating must not reset the draft: there is no server
    // record behind this form, so there is nothing newer to adopt.
    rerender(createForm());

    expect(screen.getByLabelText<HTMLInputElement>(/Định danh/).value).toBe('garden-suite');
  });

  it('treats a cross-partner 404 exactly like an absent one, with no reload offer', async () => {
    update.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    // Doc 85 §6.3 — identical wording whether absent or out of scope, and no
    // reload button, because reloading will not make it appear.
    expect(alert.textContent).toContain('Không tìm thấy tài nguyên');
    expect(screen.queryByRole('button', { name: 'Tải lại thông tin mới nhất' })).toBeNull();
  });

  it('reports a refused CSRF without exposing anything internal', async () => {
    update.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Bạn không có quyền');
    expect(alert.textContent).not.toMatch(/XSRF|token|cookie/i);
  });

  it('reports an unreachable backend without leaking the exception', async () => {
    update.mockRejectedValue(new TypeError('fetch failed to http://internal-host:8080'));
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không thể kết nối');
    expect(alert.textContent).not.toContain('internal-host');
  });

  it('shows status read-only, with no control that could publish', () => {
    render(editForm());

    expect(screen.getByText(/Bản nháp/)).toBeTruthy();
    expect(screen.getByText(/Đối tác không thể tự đăng loại phòng/)).toBeTruthy();
    // isPartnerPermittedTransition refuses PUBLISHED outright, so any such
    // control would be a save the backend answers 409 to.
    expect(screen.queryByRole('button', { name: /đăng|publish|xuất bản/i })).toBeNull();
    // No *control* for status. Asserted by role rather than by label: STEP K
    // made each group a labelled `<section>`, so "Trạng thái" now names a region
    // as well as — hypothetically — a field, and `queryByLabelText` would match
    // the heading and fail on a page that offers nothing editable at all.
    expect(screen.queryByRole('textbox', { name: /Trạng thái/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Trạng thái/ })).toBeNull();
  });

  it('writes nothing to web storage', async () => {
    update.mockResolvedValue({ ...existing, version: 5 });
    render(editForm());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
