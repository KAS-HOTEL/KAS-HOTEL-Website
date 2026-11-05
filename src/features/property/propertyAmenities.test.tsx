// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { AmenityCatalogEntry } from '@/lib/domain/roomType';
import type * as Primitives from '@/ui/primitives';

const setAmenities = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: { setAmenities: (...args: unknown[]) => setAmenities(...args) },
}));
vi.mock('./actions', () => ({ revalidateProperties: () => Promise.resolve() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PropertyAmenitiesPanel } = await import('./PropertyAmenitiesPanel');

const PROPERTY = '11111111-1111-4111-8111-111111111111';

function entry(
  code: string,
  category: string,
  name: string,
  overrides: Partial<AmenityCatalogEntry> = {},
): AmenityCatalogEntry {
  return { code, category, names: { vi: name, en: name }, isHighlight: false, sortOrder: 0, ...overrides };
}

const CATALOG: readonly AmenityCatalogEntry[] = [
  entry('wifi-free', 'CONNECTIVITY', 'Wi-Fi miễn phí'),
  entry('parking', 'PROPERTY_FACILITY', 'Chỗ đỗ xe'),
  entry('lift-access', 'ACCESSIBILITY', 'Thang máy'),
];

function panel(props: Partial<React.ComponentProps<typeof PropertyAmenitiesPanel>> = {}) {
  return (
    <PropertyAmenitiesPanel
      propertyId={PROPERTY}
      assigned={[]}
      catalog={CATALOG}
      {...props}
    />
  );
}

function saveButton() {
  return screen.getByRole('button', { name: 'Lưu tiện nghi' });
}

afterEach(cleanup);
beforeEach(() => {
  setAmenities.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});

describe('what the picker offers', () => {
  it('offers the whole catalogue, property facilities included', () => {
    render(panel());

    // The room-type form hides PROPERTY_FACILITY because a room may not claim
    // the building's car park. The property is the other side of that rule.
    expect(screen.getByLabelText('Chỗ đỗ xe')).toBeTruthy();
    expect(screen.getByLabelText('Wi-Fi miễn phí')).toBeTruthy();
    expect(screen.getByLabelText('Thang máy')).toBeTruthy();
  });

  it('groups by the catalogue’s own category', () => {
    render(panel());

    expect(screen.getAllByRole('group')).toHaveLength(3);
  });

  it('checks what the property already has', () => {
    render(panel({ assigned: ['parking'] }));

    expect((screen.getByLabelText('Chỗ đỗ xe') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Wi-Fi miễn phí') as HTMLInputElement).checked).toBe(false);
  });

  it('says so when the catalogue could not be loaded', () => {
    render(panel({ catalog: [], catalogError: 'Không tải được.' }));

    expect(screen.getByRole('alert').textContent).toContain('Không tải được.');
    expect(screen.getByText('Chưa có danh mục tiện nghi')).toBeTruthy();
  });

  it('keeps an assigned code the catalogue no longer offers', () => {
    render(panel({ assigned: ['retired-code'] }));

    // Dropping it silently would strip the assignment on the next save, since
    // saving sends the whole selection.
    expect(screen.getByText(/retired-code/)).toBeTruthy();
  });
});

describe('saving', () => {
  it('sends the whole selection, not a delta', async () => {
    setAmenities.mockResolvedValue({});
    render(panel({ assigned: ['wifi-free'] }));

    await userEvent.click(screen.getByLabelText('Thang máy'));
    await userEvent.click(saveButton());

    await waitFor(() => expect(setAmenities).toHaveBeenCalled());
    expect(setAmenities.mock.calls[0]).toEqual([PROPERTY, ['wifi-free', 'lift-access']]);
  });

  it('clears the selection with an empty array', async () => {
    setAmenities.mockResolvedValue({});
    render(panel({ assigned: ['wifi-free'] }));

    await userEvent.click(screen.getByLabelText('Wi-Fi miễn phí'));
    await userEvent.click(saveButton());

    // Replace-not-merge is the only way to remove one added by mistake.
    await waitFor(() => expect(setAmenities).toHaveBeenCalled());
    expect(setAmenities.mock.calls[0]).toEqual([PROPERTY, []]);
  });

  it('sends no version, because the route takes none', async () => {
    setAmenities.mockResolvedValue({});
    render(panel());

    await userEvent.click(screen.getByLabelText('Chỗ đỗ xe'));
    await userEvent.click(saveButton());

    // The route replaces rows in property_amenity rather than updating the
    // property row, so there is no column for a stale writer to clobber.
    await waitFor(() => expect(setAmenities).toHaveBeenCalled());
    expect(setAmenities.mock.calls[0]).toHaveLength(2);
  });

  it('re-reads from the server rather than simulating the result', async () => {
    setAmenities.mockResolvedValue({});
    render(panel());

    await userEvent.click(screen.getByLabelText('Chỗ đỗ xe'));
    await userEvent.click(saveButton());

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('tiện nghi'));
  });

  it('offers no save until something changed', async () => {
    render(panel({ assigned: ['wifi-free'] }));

    expect(saveButton().hasAttribute('disabled')).toBe(true);

    await userEvent.click(screen.getByLabelText('Thang máy'));
    expect(saveButton().hasAttribute('disabled')).toBe(false);
  });
});

describe('when the server refuses', () => {
  it('shows the refusal and does not claim success', async () => {
    setAmenities.mockRejectedValue(new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'One or more amenity codes are not in the catalog.',
      details: [{ field: 'amenityCodes', code: 'UNKNOWN_AMENITY', message: "'nope' is not in the amenity catalog." }],
      correlationId: 'corr-1',
    }));
    render(panel());

    await userEvent.click(screen.getByLabelText('Chỗ đỗ xe'));
    await userEvent.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('amenity codes');
    expect(refresh).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('keeps the Partner’s selection so it can be corrected, not retyped', async () => {
    setAmenities.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'corr-2',
    }));
    render(panel());

    await userEvent.click(screen.getByLabelText('Chỗ đỗ xe'));
    await userEvent.click(saveButton());

    await screen.findByRole('alert');
    expect((screen.getByLabelText('Chỗ đỗ xe') as HTMLInputElement).checked).toBe(true);
  });
});
