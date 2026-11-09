// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PublicFacility } from '@/lib/domain/availability';

const facilitiesApi = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  publicHotelsApi: { facilities: (...args: unknown[]) => facilitiesApi(...args) },
  // `load.ts` imports this too. A factory that omits a named export the module
  // under test imports leaves it undefined, and the failure surfaces somewhere
  // unrelated — here, as the error branch appearing to rethrow.
  reservationsApi: { receipt: vi.fn() },
}));

const { HotelFacilities, facilityCopy } = await import('./HotelFacilities');
const { loadFacilities } = await import('./load');

function facility(overrides: Partial<PublicFacility> = {}): PublicFacility {
  return {
    type: 'ROOFTOP',
    name: 'The KAS Rooftop',
    description: 'A bar above District 1.',
    openToNonResidents: true,
    ...overrides,
  };
}

afterEach(cleanup);
// Block body on purpose: an expression arrow returns the mock, and Vitest calls
// a value returned from `beforeEach` as a teardown — which would invoke the mock
// with no arguments after every test and leave its rejection unobserved.
beforeEach(() => {
  facilitiesApi.mockReset();
});

describe('the loader', () => {
  it('returns what the backend served', async () => {
    facilitiesApi.mockResolvedValue([facility()]);

    const result = await loadFacilities('kas-milestone-premium-hotel', 'en');

    expect(result).toEqual({ status: 'ok', facilities: [facility()] });
    expect(facilitiesApi).toHaveBeenCalledWith('kas-milestone-premium-hotel', 'en');
  });

  it('treats an empty list as success, not as an error', async () => {
    facilitiesApi.mockResolvedValue([]);

    // The common state today: no hotel has authored a facility yet.
    await expect(loadFacilities('kas-dilly-hotel', 'vi')).resolves.toEqual({
      status: 'ok',
      facilities: [],
    });
  });

  it('surfaces a backend failure as an error', async () => {
    facilitiesApi.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c1',
    }));

    expect((await loadFacilities('x', 'en')).status).toBe('error');
  });
});

describe('the guest section', () => {
  it('renders the hotel’s own words, not the type', () => {
    render(<HotelFacilities facilities={[facility()]} copy={facilityCopy('en')} />);

    const entry = screen.getByRole('listitem');
    expect(within(entry).getByRole('heading', { name: 'The KAS Rooftop' })).toBeTruthy();
    expect(within(entry).getByText('A bar above District 1.')).toBeTruthy();
    // The kind is a label above the name, not a substitute for it.
    expect(within(entry).getByText('Rooftop')).toBeTruthy();
  });

  it('renders every facility the backend returned, in that order', () => {
    render(
      <HotelFacilities
        facilities={[
          facility({ type: 'POOL', name: 'The Pool' }),
          facility({ type: 'GYM', name: 'The Gym' }),
        ]}
        copy={facilityCopy('en')}
      />,
    );

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // The array order is the operator's order; nothing re-sorts it here.
    expect(names).toEqual(['The Pool', 'The Gym']);
  });

  it('renders nothing at all when the hotel has none', () => {
    const { container } = render(
      <HotelFacilities facilities={[]} copy={facilityCopy('en')} />,
    );

    // Unlike the policies, where "none published" is something a guest must be
    // told before agreeing to terms, an absent facility section says nothing.
    expect(container.innerHTML).toBe('');
  });

  it('omits a description the hotel has not written', () => {
    render(
      <HotelFacilities
        facilities={[facility({ description: null })]}
        copy={facilityCopy('en')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'The KAS Rooftop' })).toBeTruthy();
    expect(screen.queryByText('A bar above District 1.')).toBeNull();
  });

  it('notes non-residents only when the operator said yes', () => {
    const { rerender } = render(
      <HotelFacilities facilities={[facility()]} copy={facilityCopy('en')} />,
    );
    expect(screen.getByText('Open to non-residents')).toBeTruthy();

    // false and null both say nothing: "residents only" is a claim the operator
    // has not necessarily made, and an unstated field is not a denial.
    rerender(
      <HotelFacilities
        facilities={[facility({ openToNonResidents: false })]}
        copy={facilityCopy('en')}
      />,
    );
    expect(screen.queryByText('Open to non-residents')).toBeNull();

    rerender(
      <HotelFacilities
        facilities={[facility({ openToNonResidents: null })]}
        copy={facilityCopy('en')}
      />,
    );
    expect(screen.queryByText('Open to non-residents')).toBeNull();
  });

  it('shows an unrecognised type as itself rather than dropping it', () => {
    render(
      <HotelFacilities
        facilities={[facility({ type: 'HELIPAD', name: 'The Helipad' })]}
        copy={facilityCopy('en')}
      />,
    );

    // A type added to the enum later must not vanish behind a lookup miss.
    expect(screen.getByText('HELIPAD')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The Helipad' })).toBeTruthy();
  });

  it('reads in the guest’s locale', () => {
    render(
      <HotelFacilities
        facilities={[facility({ name: 'Sân thượng KAS' })]}
        copy={facilityCopy('vi')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Tiện ích khách sạn' })).toBeTruthy();
    expect(screen.getByText('Sân thượng')).toBeTruthy();
    expect(screen.getByText('Đón cả khách không lưu trú')).toBeTruthy();
  });

  it('shows no Vietnamese on the English page', () => {
    const { container } = render(
      <HotelFacilities facilities={[facility()]} copy={facilityCopy('en')} />,
    );

    // The 16A.33 guard: a character class, not a word list, so a newly
    // hardcoded Vietnamese string cannot slip past it.
    expect(container.textContent ?? '').not.toMatch(/[ăâđêôơưÀ-ỹ]/);
  });

  it('exposes no identifier a guest has no use for', () => {
    const { container } = render(
      <HotelFacilities facilities={[facility()]} copy={facilityCopy('en')} />,
    );

    expect(container.textContent ?? '').not.toMatch(/sortOrder|archived|propertyId|"id"/i);
  });
});
