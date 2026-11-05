// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublishedRoomType } from '@/lib/domain/availability';
import { HotelRoomTypes, roomTypeCopy } from './HotelRoomTypes';

function room(overrides: Partial<PublishedRoomType> = {}): PublishedRoomType {
  return {
    slug: 'deluxe-city-view',
    name: 'Deluxe City View',
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    areaSqm: 32.5,
    viewType: 'CITY',
    ...overrides,
  };
}

afterEach(cleanup);

describe('the rooms a hotel offers', () => {
  it('renders the name, occupancy, area and view the server sent', () => {
    render(<HotelRoomTypes roomTypes={[room()]} copy={roomTypeCopy('en')} />);

    expect(screen.getByRole('heading', { name: 'Deluxe City View', level: 3 })).toBeTruthy();
    expect(screen.getByText('2 adults · 1 child')).toBeTruthy();
    expect(screen.getByText('32.5 m²')).toBeTruthy();
    expect(screen.getByText('City view')).toBeTruthy();
  });

  it('keeps the server’s order', () => {
    const { container } = render(
      <HotelRoomTypes
        roomTypes={[
          room({ slug: 'suite', name: 'Suite' }),
          room({ slug: 'deluxe', name: 'Deluxe' }),
          room({ slug: 'standard', name: 'Standard' }),
        ]}
        copy={roomTypeCopy('en')}
      />,
    );

    // Rows arrive ordered by the operator's sort_order, then slug. Re-sorting
    // here would override an editorial decision the console already made.
    const names = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(names).toEqual(['Suite', 'Deluxe', 'Standard']);
  });

  it('omits an absent area or view instead of inventing one', () => {
    render(
      <HotelRoomTypes
        roomTypes={[room({ areaSqm: null, viewType: null })]}
        copy={roomTypeCopy('en')}
      />,
    );

    // Both are nullable in the schema. A zero would be a claim; a blank row noise.
    expect(screen.queryByText('Size')).toBeNull();
    expect(screen.queryByText('View')).toBeNull();
    expect(screen.queryByText(/0 m²/)).toBeNull();
    // Occupancy is not nullable, so it stays.
    expect(screen.getByText('Occupancy')).toBeTruthy();
  });

  it('drops the child count when a room takes none, and singularises', () => {
    render(
      <HotelRoomTypes
        roomTypes={[room({ maxAdults: 1, maxChildren: 0, maxOccupancy: 1 })]}
        copy={roomTypeCopy('en')}
      />,
    );

    expect(screen.getByText('1 adult')).toBeTruthy();
    expect(screen.queryByText(/child/)).toBeNull();
  });

  it('adds the total only when it says something the counts do not', () => {
    // room_type_occupancy_fit allows maxOccupancy below adults + children, so
    // printing all three unconditionally would usually be noise.
    cleanup();
    render(
      <HotelRoomTypes
        roomTypes={[room({ maxAdults: 2, maxChildren: 2, maxOccupancy: 3 })]}
        copy={roomTypeCopy('en')}
      />,
    );
    expect(screen.getByText('2 adults · 2 children · sleeps 3')).toBeTruthy();

    cleanup();
    render(
      <HotelRoomTypes
        roomTypes={[room({ maxAdults: 2, maxChildren: 1, maxOccupancy: 3 })]}
        copy={roomTypeCopy('en')}
      />,
    );
    expect(screen.getByText('2 adults · 1 child')).toBeTruthy();
  });

  it('falls back to the backend’s own value for an unlabelled view', () => {
    render(
      <HotelRoomTypes roomTypes={[room({ viewType: 'GARDEN' })]} copy={roomTypeCopy('en')} />,
    );

    expect(screen.getByText('GARDEN')).toBeTruthy();
  });

  it('says a hotel has published none rather than inventing rooms', () => {
    render(<HotelRoomTypes roomTypes={[]} copy={roomTypeCopy('en')} />);

    expect(screen.getByText(/has not published any room types yet/)).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});

describe('it never claims availability', () => {
  it('says in words that this is not an availability list', () => {
    render(<HotelRoomTypes roomTypes={[room()]} copy={roomTypeCopy('en')} />);

    // A room shown here means "this hotel offers it", never "it is free on your
    // dates". The endpoint carries no inventory field at all.
    expect(screen.getByText(/Choose your dates above to see which are free/)).toBeTruthy();
  });

  it('shows no price, no count and no availability wording', () => {
    const { container } = render(
      <HotelRoomTypes roomTypes={[room()]} copy={roomTypeCopy('en')} />,
    );

    expect(container.textContent).not.toMatch(/available|còn trống|₫|VND|per night/i);
    // "sleeps 3" is occupancy, not stock; nothing here reports a quantity of rooms.
    expect(container.textContent).not.toMatch(/\d+\s*(rooms? left|available)/i);
  });
});

describe('localization', () => {
  it('renders Vietnamese on the Vietnamese page', () => {
    render(<HotelRoomTypes roomTypes={[room()]} copy={roomTypeCopy('vi')} />);

    expect(screen.getByRole('heading', { name: 'Các loại phòng', level: 2 })).toBeTruthy();
    expect(screen.getByText('Sức chứa')).toBeTruthy();
    expect(screen.getByText('2 người lớn · 1 trẻ em')).toBeTruthy();
    expect(screen.getByText('Hướng thành phố')).toBeTruthy();
    expect(screen.getByText(/Chọn ngày ở phía trên/)).toBeTruthy();
  });

  it('labels all five frozen view types in both locales', () => {
    for (const view of ['CITY', 'STREET', 'COURTYARD', 'ROOFTOP', 'INTERIOR']) {
      expect(roomTypeCopy('vi').views[view]).toBeTruthy();
      expect(roomTypeCopy('en').views[view]).toBeTruthy();
    }
  });

  it('falls back to English for anything else', () => {
    expect(roomTypeCopy('fr').heading).toBe('Room types');
  });
});

describe('structure', () => {
  it('is a labelled section a screen reader can jump to', () => {
    render(<HotelRoomTypes roomTypes={[room()]} copy={roomTypeCopy('en')} />);

    const section = screen.getByRole('region', { name: 'Room types' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
  });

  it('exposes no internal identifier', () => {
    const { container } = render(
      <HotelRoomTypes roomTypes={[room()]} copy={roomTypeCopy('en')} />,
    );

    // PublishedRoomType carries no id, propertyId or status; the slug is an
    // addressing detail a guest has no use for either.
    expect(container.textContent).not.toMatch(/roomTypeId|propertyId|PUBLISHED|status/i);
    expect(container.textContent).not.toContain('deluxe-city-view');
  });
});
