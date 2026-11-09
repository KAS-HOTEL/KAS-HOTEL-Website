// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView } from '@/lib/domain/property';
import type * as Primitives from '@/ui/primitives';

const update = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: { update: (...args: unknown[]) => update(...args) },
}));
vi.mock('./actions', () => ({ revalidateProperties: () => revalidate() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PropertyInformationForm, mapFieldErrors } = await import('./PropertyInformationForm');

const property: PropertyAdminView = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'hotel-alpha',
  names: { vi: 'Khách sạn Alpha', en: 'Alpha Hotel' },
  signatureLines: {},
  shortDescriptions: {},
  amenityCodes: [],
    tripIntentCodes: [],
  lifecycleState: 'DRAFT',
  isFlagship: false,
  district: 'Quận 1',
  city: 'Ho Chi Minh City',
  sortOrder: 1,
  version: 4,
};

/**
 * One real edit, so a save can happen at all.
 *
 * The save button is disabled while the form is untouched: PATCH bumps
 * {@code version} unconditionally, so an idle click would invalidate the version
 * every other open editor is holding without changing a single column. Tests
 * about what a save *does* therefore have to change something first. It lives
 * here, in one place, to make plain that it is setup rather than part of what
 * any individual test is asserting.
 */
async function makeAnEdit() {
  await userEvent.type(screen.getByLabelText('Tên khách sạn (Tiếng Việt)'), ' Plaza');
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
  update.mockReset();
  refresh.mockReset();
  revalidate.mockReset();
  toastShow.mockReset();
});

describe('PropertyInformationForm', () => {
  it('edits only the fields the API accepts', () => {
    render(<PropertyInformationForm property={property} />);

    for (const label of [
      'Tên khách sạn (Tiếng Việt)',
      'Tên khách sạn (English)',
      'Phường/Xã',
      'Quận/Huyện',
      'Tỉnh/Thành phố',
      'Điện thoại',
    ]) {
      // Exact strings: the labels now carry parentheses, which a RegExp would
      // read as a capture group and silently fail to match.
      expect(screen.getByLabelText(label)).toBeTruthy();
    }

    // Lifecycle, flagship and sort order are not editable: a Partner publishing
    // their own hotel by PATCHing a state is what approval exists to prevent,
    // and UpdatePropertyRequest has no field for any of them.
    expect(screen.queryByLabelText(/trạng thái|nổi bật|thứ tự/i)).toBeNull();
  });

  it('seeds every input from the backend record', () => {
    render(<PropertyInformationForm property={property} />);

    expect((screen.getByLabelText('Tên khách sạn (Tiếng Việt)') as HTMLInputElement).value)
      .toBe('Khách sạn Alpha');
    expect((screen.getByLabelText(/Quận\/Huyện/) as HTMLInputElement).value).toBe('Quận 1');
    // ward was not returned, so its input starts empty rather than inventing one.
    expect((screen.getByLabelText(/Phường\/Xã/) as HTMLInputElement).value).toBe('');
  });

  it('refuses to save a form nobody has edited', async () => {
    render(<PropertyInformationForm property={property} />);

    // PATCH is an unconditional version bump, so a save that changes no column
    // still invalidates the version every other open editor is holding. There is
    // nothing to send and a real cost to sending it.
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(save.hasAttribute('disabled')).toBe(true);
    await userEvent.click(save);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows the save as soon as one field actually changes', async () => {
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();

    expect(screen.getByRole('button', { name: 'Lưu thay đổi' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('sends the version it was given, with the changed fields', async () => {
    update.mockResolvedValue({ ...property, version: 5, ward: 'Phường Bến Nghé' });
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(screen.getByLabelText(/Phường\/Xã/), 'Phường Bến Nghé');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [id, body] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(property.id);
    expect(body['version']).toBe(4);
    expect(body['ward']).toBe('Phường Bến Nghé');
    expect(body['names']).toEqual({ vi: 'Khách sạn Alpha', en: 'Alpha Hotel' });
  });

  it('omits a field the Partner never filled in', async () => {
    update.mockResolvedValue({ ...property, version: 5 });
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, body] = update.mock.calls[0] as [string, Record<string, unknown>];
    // An empty phone must not be sent: PATCH reads an absent field as "leave it",
    // and sending "" would store a blank string where NULL is meant.
    expect(body).not.toHaveProperty('phone');
    expect(body).not.toHaveProperty('ward');
  });

  it('adopts the version from the response, so the next save is not a conflict', async () => {
    update.mockResolvedValue({ ...property, version: 5 });
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    update.mockResolvedValue({ ...property, version: 6 });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    const [, second] = update.mock.calls[1] as [string, Record<string, unknown>];
    // Keeping version 4 here would make our own second save fail.
    expect(second['version']).toBe(5);
  });

  it('revalidates the server-rendered pages after a save', async () => {
    update.mockResolvedValue({ ...property, version: 5 });
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // Without this the list, the switcher and the overview keep serving the
    // pre-edit copy — and the stale version they carry would break the next save.
    await waitFor(() => expect(revalidate).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalled();
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('Đã lưu'));
  });

  it('offers a reload on a version conflict rather than only describing it', async () => {
    update.mockRejectedValue(apiError(409, 'VERSION_CONFLICT'));
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Thông tin đã thay đổi');
    // A conflict is the one error retyping cannot fix, so the action is offered.
    const reload = screen.getByRole('button', { name: 'Tải lại thông tin mới nhất' });
    await userEvent.click(reload);
    expect(refresh).toHaveBeenCalled();
  });

  it('attaches a field error to the input that owns it', async () => {
    update.mockRejectedValue(
      apiError(400, 'VALIDATION_FAILED', [{ field: 'phone', message: 'Quá dài' }]),
    );
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Điện thoại/).getAttribute('aria-invalid')).toBe('true'),
    );
  });

  it('does not let a conflict be mistaken for a not-found', async () => {
    update.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    // Identical wording whether absent or out of scope — doc 85 §6.3 — and no
    // reload button, because reloading will not make it appear.
    expect(alert.textContent).toContain('Không tìm thấy tài nguyên');
    expect(screen.queryByRole('button', { name: 'Tải lại thông tin mới nhất' })).toBeNull();
  });

  it('refuses to silently drop a cleared value', async () => {
    render(<PropertyInformationForm property={property} />);

    await userEvent.clear(screen.getByLabelText(/Quận\/Huyện/));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // PATCH has no way to express "make this empty" (OQ-136). Sending nothing
    // would make the change vanish on reload, which is worse than saying so.
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/Chưa thể xoá giá trị đã lưu/)).toBeTruthy();
  });

  it('recovers from a conflict when the refreshed record arrives', async () => {
    update.mockRejectedValue(apiError(409, 'VERSION_CONFLICT'));
    const { rerender } = render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    // What  produces: the same component, a newer record.
    // Re-rendering is the whole test — the reload button is useless if the form
    // does not adopt what the refresh fetched.
    rerender(
      <PropertyInformationForm
        property={{ ...property, version: 9, names: { vi: 'Khách sạn Beta', en: 'Beta Hotel' } }}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Tên khách sạn (Tiếng Việt)').value).toBe('Khách sạn Beta');

    // And the retry now carries the version the server actually holds.
    update.mockResolvedValue({ ...property, version: 10 });
    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    const [, retry] = update.mock.calls[1] as [string, Record<string, unknown>];
    expect(retry['version']).toBe(9);
  });

  it('switches cleanly to another property sitting at the same version', async () => {
    const { rerender } = render(<PropertyInformationForm property={property} />);
    await makeAnEdit();

    // Same version number, different hotel. Keying the resync on the version
    // alone would leave the first hotel's draft on screen under the second
    // one's heading — and save it there.
    rerender(
      <PropertyInformationForm
        property={{
          ...property,
          id: '33333333-3333-4333-8333-333333333333',
          names: { vi: 'Khách sạn Gamma', en: 'Gamma Hotel' },
        }}
      />,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Tên khách sạn (Tiếng Việt)').value).toBe(
      'Khách sạn Gamma',
    );
  });

  it('never exposes a token or writes to storage', async () => {
    update.mockResolvedValue({ ...property, version: 5 });
    render(<PropertyInformationForm property={property} />);
    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('mapFieldErrors', () => {
  it('folds both backend name shapes onto the right input', () => {
    // Bean validation reports a map entry as names[vi]; the service reports an
    // unsupported locale as names.fr. Both must reach an input the Partner can act on.
    expect(
      mapFieldErrors(apiError(400, 'VALIDATION_FAILED', [
        { field: 'names[vi]', message: 'Bắt buộc' },
      ]))['nameVi'],
    ).toBe('Bắt buộc');

    expect(
      mapFieldErrors(apiError(400, 'VALIDATION_FAILED', [
        { field: 'names.en', message: 'Too long' },
      ]))['nameEn'],
    ).toBe('Too long');
  });

  it('passes a plain field through unchanged', () => {
    expect(
      mapFieldErrors(apiError(400, 'VALIDATION_FAILED', [
        { field: 'district', message: 'Quá dài' },
      ]))['district'],
    ).toBe('Quá dài');
  });
});

/**
 * Coordinate authoring — Step 16A.46.
 *
 * The backend has accepted `latitude`/`longitude` on this PATCH since Step
 * 16A.45; until now nothing in the console could send them, so the capability
 * existed and was unreachable. These cover the reachability, not the backend
 * rules, which `PropertyCoordinatesIT` already holds.
 */
describe('PropertyInformationForm coordinates', () => {
  const located: PropertyAdminView = { ...property, latitude: 10.7725, longitude: 106.698 };

  function latitudeInput() {
    return screen.getByLabelText(/Vĩ độ/) as HTMLInputElement;
  }

  function longitudeInput() {
    return screen.getByLabelText(/Kinh độ/) as HTMLInputElement;
  }

  it('renders a latitude and a longitude field', () => {
    render(<PropertyInformationForm property={property} />);

    expect(latitudeInput()).toBeTruthy();
    expect(longitudeInput()).toBeTruthy();
    // Numeric on purpose: a mobile Partner gets the decimal keypad, and the
    // bounds are announced by the control rather than only discovered on save.
    expect(latitudeInput().type).toBe('number');
    expect(latitudeInput().min).toBe('-90');
    expect(latitudeInput().max).toBe('90');
    expect(longitudeInput().min).toBe('-180');
    expect(longitudeInput().max).toBe('180');
  });

  it('populates the fields from a stored point', () => {
    render(<PropertyInformationForm property={located} />);

    expect(latitudeInput().value).toBe('10.7725');
    expect(longitudeInput().value).toBe('106.698');
  });

  it('leaves both fields empty when the property has no point', () => {
    render(<PropertyInformationForm property={property} />);

    // Not the city centre, not 0,0. A coordinate nobody authored must not be one
    // save away from being stored as though somebody had.
    expect(latitudeInput().value).toBe('');
    expect(longitudeInput().value).toBe('');
  });

  it('submits typed coordinates as numbers through the existing PATCH', async () => {
    update.mockResolvedValue({ ...located, version: 5 });
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(latitudeInput(), '10.772500');
    await userEvent.type(longitudeInput(), '106.698000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, body] = update.mock.calls[0] as [string, Record<string, unknown>];
    // Numbers, not strings: UpdatePropertyRequest binds BigDecimal, and a quoted
    // value is a 400 the Partner would have no way to interpret.
    expect(body['latitude']).toBe(10.7725);
    expect(body['longitude']).toBe(106.698);
    expect(body['version']).toBe(4);
  });

  it('sends one coordinate without the other', async () => {
    update.mockResolvedValue({ ...property, version: 5, latitude: 10.7725 });
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(latitudeInput(), '10.7725');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, body] = update.mock.calls[0] as [string, Record<string, unknown>];
    // No frozen document makes them a mandatory pair, and a Partner mid-draft
    // may genuinely have only one. Inventing the pairing rule here would refuse
    // a request the backend accepts.
    expect(body['latitude']).toBe(10.7725);
    expect(body).not.toHaveProperty('longitude');
  });

  it('omits both when neither was filled in', async () => {
    update.mockResolvedValue({ ...property, version: 5 });
    render(<PropertyInformationForm property={property} />);

    await makeAnEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, body] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('latitude');
    expect(body).not.toHaveProperty('longitude');
  });

  it('refuses a latitude outside the column bounds without clamping it', async () => {
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(latitudeInput(), '91');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/Vĩ độ nằm trong khoảng -90 đến 90/)).toBeTruthy();
    // Refused, not quietly turned into 90 — the Partner typed a real number and
    // is told it was rejected.
    expect(latitudeInput().value).toBe('91');
  });

  it('refuses a longitude outside the column bounds without clamping it', async () => {
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(longitudeInput(), '-181');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/Kinh độ nằm trong khoảng -180 đến 180/)).toBeTruthy();
    expect(longitudeInput().value).toBe('-181');
  });

  it('reports both bad coordinates at once', async () => {
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(latitudeInput(), '91');
    await userEvent.type(longitudeInput(), '181');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // One problem per save is the slow loop the backend already refuses to
    // impose when it names every bad locale together.
    expect(latitudeInput().getAttribute('aria-invalid')).toBe('true');
    expect(longitudeInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a backend coordinate rejection on the input that owns it', async () => {
    update.mockRejectedValue(
      apiError(400, 'VALIDATION_FAILED', [
        { field: 'latitude', message: 'latitude is between -90 and 90' },
      ]),
    );
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(latitudeInput(), '10.7725');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // The browser check is a courtesy; the backend is the authority, and its
    // refusal must still land on the field rather than only in the form banner.
    await waitFor(() => expect(latitudeInput().getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('latitude is between -90 and 90')).toBeTruthy();
  });

  it('refuses to silently drop a cleared coordinate', async () => {
    render(<PropertyInformationForm property={located} />);

    await userEvent.clear(latitudeInput());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // Coordinates inherit OQ-136 rather than getting an exception to it: PATCH
    // coalesces a null, so no "clear" is offered and the emptied field is
    // reported instead of being sent as a no-op the Partner would not see.
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/Chưa thể xoá giá trị đã lưu/)).toBeTruthy();
  });

  it('leaves the existing address fields and save behaviour untouched', async () => {
    update.mockResolvedValue({ ...located, version: 5 });
    render(<PropertyInformationForm property={located} />);

    await userEvent.type(latitudeInput(), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, body] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(body['district']).toBe('Quận 1');
    expect(body['city']).toBe('Ho Chi Minh City');
    expect(body['names']).toEqual({ vi: 'Khách sạn Alpha', en: 'Alpha Hotel' });
    // The version, the revalidation and the success toast are the same path the
    // rest of the form has always taken.
    expect(body['version']).toBe(4);
    await waitFor(() => expect(revalidate).toHaveBeenCalledTimes(1));
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('Đã lưu'));
  });

  it('still surfaces a version conflict when coordinates are being saved', async () => {
    update.mockRejectedValue(apiError(409, 'VERSION_CONFLICT'));
    render(<PropertyInformationForm property={property} />);

    await userEvent.type(latitudeInput(), '10.7725');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Thông tin đã thay đổi');
    expect(screen.getByRole('button', { name: 'Tải lại thông tin mới nhất' })).toBeTruthy();
  });
});
