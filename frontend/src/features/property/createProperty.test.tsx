// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { slugFromName, uniqueSlug, propertyLabel, UNNAMED_PROPERTY } from '@/lib/domain/property';
import type * as Primitives from '@/ui/primitives';

const create = vi.fn();
const update = vi.fn();
const replace = vi.fn();
const push = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
}));
vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: {
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
  },
}));
vi.mock('./actions', () => ({ revalidateProperties: (...a: unknown[]) => revalidate(...a) }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { CreatePropertyForm } = await import('./CreatePropertyForm');

/** A created property as `POST /admin/properties` returns one. */
function created(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000009-0000-4000-8000-000000000000',
    slug: 'kas-riverside-hotel',
    names: { vi: 'Kas Riverside Hotel', en: 'Kas Riverside Hotel' },
    signatureLines: {},
    shortDescriptions: {},
    amenityCodes: [],
    tripIntentCodes: [],
    lifecycleState: 'DRAFT',
    isFlagship: false,
    sortOrder: 9,
    version: 1,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  create.mockReset();
  update.mockReset();
  replace.mockReset();
  push.mockReset();
  revalidate.mockReset();
  toastShow.mockReset();
});

const form = (existingSlugs: readonly string[] = []) =>
  render(<CreatePropertyForm existingSlugs={existingSlugs} />);

/**
 * Deriving the URL segment from the name.
 *
 * The operator is never asked for a slug — `POST /admin/properties` requires
 * one and the database CHECKs its shape, which makes it the most technical
 * field in the console and the least useful to a hotelier. These are the rules
 * that let the form supply it.
 */
describe('slugFromName', () => {
  it('folds Vietnamese diacritics rather than dropping the letters', () => {
    expect(slugFromName('Khách sạn Kas Hoà Bình')).toBe('khach-san-kas-hoa-binh');
    expect(slugFromName('Đà Nẵng')).toBe('da-nang');
  });

  it('produces only what the property_slug_format CHECK accepts', () => {
    const shape = /^[a-z0-9][a-z0-9-]*$/u;
    for (const name of [
      'Kas Riverside Hotel',
      'KAS  DOUBLE   SPACES',
      'Kas & Co. (Quận 1)',
      'Khách sạn 5 sao — Số 7',
      "L'Hôtel Kas",
    ]) {
      expect(slugFromName(name)).toMatch(shape);
    }
  });

  it('collapses punctuation runs and trims the ends', () => {
    expect(slugFromName('  --Kas   Hotel!!  ')).toBe('kas-hotel');
    expect(slugFromName('Kas -- Hotel')).toBe('kas-hotel');
  });

  it('returns nothing for a name with nothing a URL can carry', () => {
    // The form treats this as "cannot derive" and says so before it posts.
    expect(slugFromName('!!!')).toBe('');
    expect(slugFromName('   ')).toBe('');
  });

  it('stays within the column bound without ending on a hyphen', () => {
    const derived = slugFromName('Kas '.repeat(60));
    expect(derived.length).toBeLessThanOrEqual(120);
    expect(derived.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('leaves a free slug alone', () => {
    expect(uniqueSlug('kas-hotel', ['other-hotel'])).toBe('kas-hotel');
  });

  it('steps past the partner’s own existing slugs', () => {
    expect(uniqueSlug('kas-hotel', ['kas-hotel'])).toBe('kas-hotel-2');
    expect(uniqueSlug('kas-hotel', ['kas-hotel', 'kas-hotel-2'])).toBe('kas-hotel-3');
  });

  it('passes an empty base through untouched', () => {
    // "Cannot derive" must not become "kas--2"; the caller reports it instead.
    expect(uniqueSlug('', ['x'])).toBe('');
  });
});

describe('propertyLabel', () => {
  it('prefers a real name', () => {
    expect(propertyLabel({ vi: 'Kas Elegance', en: 'Kas Elegance' })).toBe('Kas Elegance');
  });

  it('states the absence rather than falling back to an identifier', () => {
    expect(propertyLabel({})).toBe(UNNAMED_PROPERTY);
    expect(propertyLabel({})).not.toContain('-');
  });
});

describe('the create property form', () => {
  it('derives the web address from the name as it is typed', async () => {
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');

    const derived = screen.getByLabelText(/Địa chỉ trang/) as HTMLInputElement;
    expect(derived.value).toBe('kas-riverside-hotel');
    // Shown, but not something the operator can get wrong.
    expect(derived.readOnly).toBe(true);
  });

  it('steps around a name the partner already used', async () => {
    form(['kas-riverside-hotel']);

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');

    expect((screen.getByLabelText(/Địa chỉ trang/) as HTMLInputElement).value)
      .toBe('kas-riverside-hotel-2');
  });

  it('posts the derived slug with the trimmed name', async () => {
    create.mockResolvedValue(created());
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), '  Kas Riverside Hotel  ');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        slug: 'kas-riverside-hotel',
        name: 'Kas Riverside Hotel',
      }),
    );
  });

  it('saves the address as a second request, because that is where the API takes it', async () => {
    create.mockResolvedValue(created());
    update.mockResolvedValue(created({ version: 2 }));
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');
    await userEvent.type(screen.getByLabelText(/Quận \/ Huyện/), 'Quận 1');
    await userEvent.type(screen.getByLabelText(/Điện thoại/), '0900000000');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('00000009-0000-4000-8000-000000000000', {
        version: 1,
        district: 'Quận 1',
        phone: '0900000000',
      }),
    );
    // Only the fields that were filled in: a PATCH of empty strings would write
    // blanks over columns the create left null.
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('city');
  });

  it('makes no second request when no address was entered', async () => {
    create.mockResolvedValue(created());
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(update).not.toHaveBeenCalled();
  });

  it('lands on the new property once it exists', async () => {
    create.mockResolvedValue(created());
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/partner/properties/00000009-0000-4000-8000-000000000000',
      ),
    );
    expect(revalidate).toHaveBeenCalled();
  });

  it('refuses to post a name with nothing a URL can carry', async () => {
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), '!!!');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/ít nhất một chữ cái hoặc chữ số/)).toBeTruthy();
  });

  it('refuses to post an empty name', async () => {
    form();

    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Nhập tên khách sạn.')).toBeTruthy();
  });

  it('reports a taken address against the field the operator can change', async () => {
    create.mockRejectedValue(
      new ApiError(400, {
        code: 'VALIDATION_FAILED',
        message: 'That web address is already in use. Choose a different name.',
        details: [{ field: 'slug', code: 'SLUG_TAKEN', message: 'This address is already taken.' }],
        correlationId: 'c-1',
      }),
    );
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    // The form has no slug input, so a field error on `slug` would be invisible.
    // It is re-pointed at the name, which is the thing they can retype.
    await waitFor(() =>
      expect(screen.getByText('Tên này đã được dùng. Hãy chọn một tên khác.')).toBeTruthy(),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps the hotel when only the address save fails', async () => {
    create.mockResolvedValue(created());
    update.mockRejectedValue(
      new ApiError(409, {
        code: 'VERSION_CONFLICT',
        message: 'conflict',
        details: [],
        correlationId: 'c-2',
      }),
    );
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');
    await userEvent.type(screen.getByLabelText(/Quận \/ Huyện/), 'Quận 1');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách sạn' }));

    // The property is real by then. Losing it, or claiming the whole thing
    // failed, would both be lies — so the operator is sent to the page that can
    // finish it, with the reference the failure carried.
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/partner/properties/00000009-0000-4000-8000-000000000000/information',
      ),
    );
    expect(toastShow).toHaveBeenCalledWith('warning', expect.stringContaining('chưa lưu được địa chỉ'), 'c-2');
  });

  it('does not submit twice when the button is double-clicked', async () => {
    // Never resolves, so the form stays in flight for the whole test.
    create.mockReturnValue(new Promise(() => {}));
    form();

    await userEvent.type(screen.getByLabelText(/Tên khách sạn/), 'Kas Riverside Hotel');
    const submit = screen.getByRole('button', { name: /Tạo khách sạn|Đang tạo/ });
    await userEvent.click(submit);
    await userEvent.click(submit);

    // A creation form has no idempotency key behind it; a second POST would be a
    // second hotel.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('says the hotel starts as a draft, because created and live are different', () => {
    form();

    expect(screen.getByText(/trạng thái bản nháp/)).toBeTruthy();
  });
});
