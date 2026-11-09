// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicLandmark } from '@/lib/domain/availability';
import { HotelLandmarks, landmarkCopy } from './HotelLandmarks';

function landmark(overrides: Partial<PublicLandmark> = {}): PublicLandmark {
  return {
    name: 'Ben Thanh Market',
    description: "The city's oldest market.",
    type: 'MARKET',
    distanceMetres: 500,
    walkingMinutes: 6,
    ...overrides,
  };
}

afterEach(cleanup);

describe('the guest section', () => {
  it('renders the name, the measures and the hotel’s own words', () => {
    render(<HotelLandmarks landmarks={[landmark()]} copy={landmarkCopy('en')} />);

    const entry = screen.getByRole('listitem');
    expect(within(entry).getByRole('heading', { name: 'Ben Thanh Market' })).toBeTruthy();
    expect(within(entry).getByText('6 min walk · 500 m')).toBeTruthy();
    expect(within(entry).getByText("The city's oldest market.")).toBeTruthy();
  });

  it('keeps the backend’s order rather than sorting by distance', () => {
    render(
      <HotelLandmarks
        landmarks={[
          landmark({ name: 'Far Museum', distanceMetres: 2000, walkingMinutes: 25 }),
          landmark({ name: 'Near Cafe', distanceMetres: 100, walkingMinutes: 2 }),
        ]}
        copy={landmarkCopy('en')}
      />,
    );

    // Which landmark matters most is an editorial judgement doc 03 §5.2 leaves
    // to the hotel; the nearest place is not always the reason someone books.
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Far Museum', 'Near Cafe']);
  });

  it('renders nothing at all when the hotel has none', () => {
    const { container } = render(
      <HotelLandmarks landmarks={[]} copy={landmarkCopy('en')} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('still lists a landmark the hotel has not measured', () => {
    render(
      <HotelLandmarks
        landmarks={[landmark({ distanceMetres: null, walkingMinutes: null })]}
        copy={landmarkCopy('en')}
      />,
    );

    // A named place is worth listing before someone has walked it with a
    // stopwatch — and no distance is invented for it.
    expect(screen.getByRole('heading', { name: 'Ben Thanh Market' })).toBeTruthy();
    expect(screen.queryByText(/m$|min walk/)).toBeNull();
  });

  it('never derives one measure from the other', () => {
    const { rerender } = render(
      <HotelLandmarks
        landmarks={[landmark({ walkingMinutes: null })]}
        copy={landmarkCopy('en')}
      />,
    );
    expect(screen.getByText('500 m')).toBeTruthy();
    expect(screen.queryByText(/min walk/)).toBeNull();

    rerender(
      <HotelLandmarks
        landmarks={[landmark({ distanceMetres: null })]}
        copy={landmarkCopy('en')}
      />,
    );
    expect(screen.getByText('6 min walk')).toBeTruthy();
    expect(screen.queryByText(/500 m/)).toBeNull();
  });

  it('writes a long distance in kilometres', () => {
    render(
      <HotelLandmarks
        landmarks={[landmark({ distanceMetres: 1200, walkingMinutes: null })]}
        copy={landmarkCopy('en')}
      />,
    );

    // "1.2 km" is what a person reads; "1200 m" is what a database stores. The
    // rounding is presentation only.
    expect(screen.getByText('1.2 km')).toBeTruthy();
  });

  it('omits a description the hotel has not written', () => {
    render(
      <HotelLandmarks
        landmarks={[landmark({ description: null })]}
        copy={landmarkCopy('en')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ben Thanh Market' })).toBeTruthy();
    expect(screen.queryByText("The city's oldest market.")).toBeNull();
  });

  it('reads in the guest’s locale', () => {
    render(
      <HotelLandmarks
        landmarks={[landmark({ name: 'Chợ Bến Thành' })]}
        copy={landmarkCopy('vi')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Xung quanh khách sạn' })).toBeTruthy();
    expect(screen.getByText('6 phút đi bộ · 500 m')).toBeTruthy();
  });

  it('shows no Vietnamese on the English page', () => {
    const { container } = render(
      <HotelLandmarks landmarks={[landmark()]} copy={landmarkCopy('en')} />,
    );

    // The 16A.33 guard: a character class, not a word list.
    expect(container.textContent ?? '').not.toMatch(/[ăâđêôơưÀ-ỹ]/);
  });

  it('exposes no identifier or ordering a guest has no use for', () => {
    const { container } = render(
      <HotelLandmarks landmarks={[landmark()]} copy={landmarkCopy('en')} />,
    );

    expect(container.textContent ?? '').not.toMatch(/sortOrder|landmarkId|propertyId/i);
  });

  it('does not render the raw type, which has no vocabulary', () => {
    const { container } = render(
      <HotelLandmarks landmarks={[landmark({ type: 'MARKET' })]} copy={landmarkCopy('en')} />,
    );

    // `landmark_type` is free text with no catalogue behind it, so there is no
    // label to translate it into and showing "MARKET" to a guest would be
    // showing them a database value.
    expect(container.textContent ?? '').not.toContain('MARKET');
  });
});
