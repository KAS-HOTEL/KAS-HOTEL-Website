// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicAmenity } from '@/lib/domain/availability';
import { HotelAmenities, amenityCopy } from './HotelAmenities';

function amenity(overrides: Partial<PublicAmenity> = {}): PublicAmenity {
  return {
    code: 'wifi-free',
    name: 'Free Wi-Fi',
    category: 'CONNECTIVITY',
    isHighlight: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe('the amenities a guest is shown', () => {
  it('renders the names the server resolved for the locale', () => {
    render(
      <HotelAmenities
        amenities={[amenity(), amenity({ code: 'work-desk', name: 'Work desk' })]}
        copy={amenityCopy('en')}
      />,
    );

    expect(screen.getByText('Free Wi-Fi')).toBeTruthy();
    expect(screen.getByText('Work desk')).toBeTruthy();
  });

  it('renders only what the server sent — never the whole catalogue', () => {
    const { container } = render(
      <HotelAmenities amenities={[amenity()]} copy={amenityCopy('en')} />,
    );

    // Doc 03 §9's P1 risk is eight hotels described identically. The catalogue
    // is a vocabulary, not a feature list.
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(screen.queryByText('Parking')).toBeNull();
  });

  it('groups by the backend’s own categories, in the order it sent them', () => {
    const { container } = render(
      <HotelAmenities
        amenities={[
          amenity({ code: 'parking', name: 'Parking', category: 'PROPERTY_FACILITY' }),
          amenity(),
          amenity({ code: 'lift', name: 'Lift', category: 'PROPERTY_FACILITY' }),
        ]}
        copy={amenityCopy('en')}
      />,
    );

    // Doc 03 §6 gives the structure as AmenityCategory → Amenity, so the
    // grouping is the taxonomy's. Order is the operator's sort_order, untouched.
    const headings = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings).toEqual(['Hotel facilities', 'Connectivity']);

    const groups = container.querySelectorAll('ul');
    expect(within(groups[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    expect(within(groups[1] as HTMLElement).getAllByRole('listitem')).toHaveLength(1);
  });

  it('falls back to the category’s own value when it has no label', () => {
    // A category added to the taxonomy later must render, not vanish.
    render(
      <HotelAmenities
        amenities={[amenity({ category: 'WELLNESS' })]}
        copy={amenityCopy('en')}
      />,
    );

    expect(screen.getByText('WELLNESS')).toBeTruthy();
    expect(screen.getByText('Free Wi-Fi')).toBeTruthy();
  });

  it('marks a property’s own highlight without turning it into a status', () => {
    const { container } = render(
      <HotelAmenities
        amenities={[amenity({ isHighlight: true }), amenity({ code: 'work-desk', name: 'Work desk' })]}
        copy={amenityCopy('en')}
      />,
    );

    const items = [...container.querySelectorAll('li')];
    expect(items[0]?.className).not.toBe('');
    expect(items[1]?.className).toBe('');
  });

  it('says a hotel has published none rather than inventing a feature list', () => {
    render(<HotelAmenities amenities={[]} copy={amenityCopy('en')} />);

    expect(screen.getByText(/has not published its amenities yet/)).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows no icon, because the contract defines none', () => {
    const { container } = render(
      <HotelAmenities amenities={[amenity()]} copy={amenityCopy('en')} />,
    );

    expect(container.querySelectorAll('svg, img')).toHaveLength(0);
  });

  it('is a labelled section a screen reader can jump to', () => {
    render(<HotelAmenities amenities={[amenity()]} copy={amenityCopy('en')} />);

    const section = screen.getByRole('region', { name: 'Amenities' });
    expect(within(section).getByRole('heading', { name: 'Amenities', level: 2 })).toBeTruthy();
  });

  it('exposes no internal identifier', () => {
    const { container } = render(
      <HotelAmenities amenities={[amenity()]} copy={amenityCopy('en')} />,
    );

    // PublishedAmenity carries no id, propertyId, sortOrder or archivedAt — and
    // the code is an identifier the guest has no use for either.
    expect(container.textContent).not.toMatch(/amenityId|propertyId|sortOrder|archivedAt/i);
    expect(container.textContent).not.toContain('wifi-free');
  });
});

describe('the copy', () => {
  it('serves both frozen locales', () => {
    expect(amenityCopy('vi').heading).toBe('Tiện nghi');
    expect(amenityCopy('en').heading).toBe('Amenities');
  });

  it('labels every one of doc 03 §6’s nine categories in both locales', () => {
    const categories = [
      'CONNECTIVITY', 'COMFORT', 'BATHROOM', 'MEDIA', 'FOOD_DRINK',
      'SERVICES', 'ACCESSIBILITY', 'FAMILY', 'PROPERTY_FACILITY',
    ];

    for (const category of categories) {
      expect(amenityCopy('vi').categories[category]).toBeTruthy();
      expect(amenityCopy('en').categories[category]).toBeTruthy();
    }
  });

  it('renders Vietnamese labels on the Vietnamese page', () => {
    render(
      <HotelAmenities
        amenities={[amenity({ name: 'Wi-Fi miễn phí' })]}
        copy={amenityCopy('vi')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Tiện nghi', level: 2 })).toBeTruthy();
    expect(screen.getByText('Kết nối')).toBeTruthy();
    expect(screen.getByText('Wi-Fi miễn phí')).toBeTruthy();
  });

  it('falls back to English for anything else', () => {
    expect(amenityCopy('fr').heading).toBe('Amenities');
  });
});
