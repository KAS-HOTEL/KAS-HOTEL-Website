// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView } from '@/lib/domain/property';
import type * as Primitives from '@/ui/primitives';

const update = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: { update: (...args: unknown[]) => update(...args) },
}));
vi.mock('./actions', () => ({ revalidateProperties: () => vi.fn() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }) };
});

const { PropertyInformationForm, mapFieldErrors } = await import('./PropertyInformationForm');

function property(overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
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
    ...overrides,
  };
}

const SIGNATURE = 'Tầm nhìn sân thượng khiến người ta quay lại';
const SHORT_VI = 'Khách sạn boutique giữa Quận 1.';
const SHORT_EN = 'A boutique hotel in District 1.';

afterEach(cleanup);
beforeEach(() => update.mockReset());

/**
 * The publish gate's own fields, which until Step 16A.27 no endpoint could
 * write. Doc 52 §3.1 makes a signature line and both-locale short descriptions
 * invariants of a publishable property; Step 16A.26 found the completeness check
 * demanding them with nothing able to supply them.
 */
describe('the editorial fields', () => {
  it('offers a signature line and a short description in both locales', () => {
    render(<PropertyInformationForm property={property()} />);

    expect(screen.getByLabelText('Câu giới thiệu (Tiếng Việt)')).toBeTruthy();
    expect(screen.getByLabelText('Câu giới thiệu (English)')).toBeTruthy();
    expect(screen.getByLabelText('Mô tả ngắn (Tiếng Việt)')).toBeTruthy();
    expect(screen.getByLabelText('Mô tả ngắn (English)')).toBeTruthy();
  });

  it('bounds each input at the length doc 23 §3.2 freezes', () => {
    render(<PropertyInformationForm property={property()} />);

    // The same numbers property_tr_sig_len and property_tr_short_len carry, so
    // the browser stops what the schema would refuse.
    expect(screen.getByLabelText('Câu giới thiệu (Tiếng Việt)').getAttribute('maxlength'))
      .toBe('90');
    expect(screen.getByLabelText('Mô tả ngắn (English)').getAttribute('maxlength'))
      .toBe('220');
  });

  it('shows what the server already stored', () => {
    render(<PropertyInformationForm property={property({
      signatureLines: { vi: SIGNATURE },
      shortDescriptions: { vi: SHORT_VI, en: SHORT_EN },
    })} />);

    expect(screen.getByLabelText<HTMLInputElement>('Câu giới thiệu (Tiếng Việt)').value)
      .toBe(SIGNATURE);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Mô tả ngắn (English)').value)
      .toBe(SHORT_EN);
    // A locale the server has nothing for is empty, not a placeholder.
    expect(screen.getByLabelText<HTMLInputElement>('Câu giới thiệu (English)').value).toBe('');
  });

  it('sends them under the names the API accepts', async () => {
    update.mockResolvedValue(property({ version: 5 }));
    render(<PropertyInformationForm property={property()} />);

    await userEvent.type(screen.getByLabelText('Câu giới thiệu (Tiếng Việt)'), SIGNATURE);
    await userEvent.type(screen.getByLabelText('Mô tả ngắn (Tiếng Việt)'), SHORT_VI);
    await userEvent.type(screen.getByLabelText('Mô tả ngắn (English)'), SHORT_EN);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const body = update.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(body['signatureLines']).toEqual({ vi: SIGNATURE });
    expect(body['shortDescriptions']).toEqual({ vi: SHORT_VI, en: SHORT_EN });
    // The version still travels — doc 58 §2, and the reason two partners editing
    // the same hotel cannot silently erase each other.
    expect(body['version']).toBe(4);
  });

  it('omits a field left empty rather than sending a blank', async () => {
    update.mockResolvedValue(property({ version: 5 }));
    render(<PropertyInformationForm property={property()} />);

    await userEvent.type(screen.getByLabelText('Câu giới thiệu (Tiếng Việt)'), SIGNATURE);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const body = update.mock.calls[0]?.[1] as Record<string, unknown>;

    // The backend reads blank as "clear this", so sending one for an untouched
    // field would delete text the Partner never looked at.
    expect(body['signatureLines']).toEqual({ vi: SIGNATURE });
    expect(body['shortDescriptions']).toBeUndefined();
  });

  it('leaves the existing name and address fields alone', async () => {
    update.mockResolvedValue(property({ version: 5 }));
    render(<PropertyInformationForm property={property()} />);

    // Dirtied through an editorial field, because the save button is disabled
    // until something changes and this test is about what the save leaves alone.
    await userEvent.type(screen.getByLabelText('Câu giới thiệu (English)'), 'Alpha, quietly');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const body = update.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(body['names']).toEqual({ vi: 'Khách sạn Alpha', en: 'Alpha Hotel' });
    expect(body['district']).toBe('Quận 1');
    expect(body['city']).toBe('Ho Chi Minh City');
  });
});

describe('server field errors land on the right input', () => {
  function error(field: string) {
    return new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'refused',
      details: [{ field, code: 'INVALID', message: 'Quá dài.' }],
      correlationId: 'corr-1',
    });
  }

  it('maps both the bracket and the dot shape, per locale', () => {
    // Bean validation reports a map entry as `signatureLines[vi]`; the service
    // reports an unsupported locale as `signatureLines.fr`.
    expect(mapFieldErrors(error('signatureLines[vi]'))['signatureVi']).toBe('Quá dài.');
    expect(mapFieldErrors(error('signatureLines[en]'))['signatureEn']).toBe('Quá dài.');
    expect(mapFieldErrors(error('shortDescriptions[vi]'))['shortVi']).toBe('Quá dài.');
    expect(mapFieldErrors(error('shortDescriptions.en'))['shortEn']).toBe('Quá dài.');
  });

  it('still maps the name fields it always did', () => {
    expect(mapFieldErrors(error('names[vi]'))['nameVi']).toBe('Quá dài.');
    expect(mapFieldErrors(error('names.en'))['nameEn']).toBe('Quá dài.');
  });

  it('leaves an unrelated field path untouched', () => {
    const mapped = mapFieldErrors(error('phone'));

    expect(mapped['phone']).toBe('Quá dài.');
    expect(mapped['signatureVi']).toBeUndefined();
  });
});
