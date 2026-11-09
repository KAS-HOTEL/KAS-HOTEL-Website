// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedProperty } from '@/lib/domain/availability';

const propertiesApi = vi.fn();
const notFoundSpy = vi.fn();

const galleryApi = vi.fn(async (...args: unknown[]) => {
  void args;
  return [];
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundSpy() }));
vi.mock('@/lib/api/endpoints', () => ({
  publicHotelsApi: {
    // The listing and detail pages read each hotel's cover photograph from the
    // public gallery. These suites are about other things, so it answers empty —
    // which is also the real state of a hotel that has published no media.
    gallery: (...a: unknown[]) => galleryApi(...a),
    properties: (...args: unknown[]) => propertiesApi(...args),
    amenities: vi.fn(),
  },
  // `load.ts` imports this too — omitting it fails somewhere unrelated.
  reservationsApi: { receipt: vi.fn() },
}));

const HomePage = await import('@/app/[locale]/page');

function hotel(overrides: Partial<PublishedProperty> = {}): PublishedProperty {
  return {
    slug: 'kas-passion-boutique-hotel',
    name: 'KAS Passion Boutique Hotel',
    city: 'Ho Chi Minh City',
    district: 'District 1',
    isFlagship: false,
    lifecycleState: 'OPEN',
    ...overrides,
  };
}

const renderHome = async (locale = 'en') =>
  render(await HomePage.default({ params: Promise.resolve({ locale }) }));

afterEach(cleanup);
beforeEach(() => {
  propertiesApi.mockReset();
  notFoundSpy.mockReset();
});

describe('the homepage collection', () => {
  it('renders the properties the endpoint returned, and only those', async () => {
    propertiesApi.mockResolvedValue([
      hotel(),
      hotel({ slug: 'kas-elegance-hotel', name: 'KAS Elegance Hotel', district: 'District 3' }),
    ]);

    await renderHome();

    expect(screen.getByText('KAS Passion Boutique Hotel')).toBeTruthy();
    expect(screen.getByText('KAS Elegance Hotel')).toBeTruthy();
    // Two returned, two rendered — the page adds no card of its own.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('says the portfolio is empty rather than showing a placeholder hotel', async () => {
    propertiesApi.mockResolvedValue([]);

    await renderHome();

    // Today's real state: eight DRAFT properties, so the endpoint returns [].
    expect(screen.getByText('No hotels published yet')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('reads the portfolio in the guest’s language', async () => {
    propertiesApi.mockResolvedValue([]);

    await renderHome('vi');

    expect(propertiesApi).toHaveBeenCalledWith('vi', {});
    expect(screen.getByText('Chưa có khách sạn nào được công bố')).toBeTruthy();
  });

  it('refuses an unsupported locale instead of guessing one', async () => {
    propertiesApi.mockResolvedValue([]);

    await renderHome('de');

    expect(notFoundSpy).toHaveBeenCalled();
  });
});

describe('the search on the homepage is the real one', () => {
  it('is a GET form onto the portfolio route, carrying no client state', async () => {
    propertiesApi.mockResolvedValue([]);

    const { container } = await renderHome('vi');

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('get');
    // A stay enquiry lands on /vi/hotels with its dates intact.
    expect(form?.getAttribute('action')).toBe('/vi/hotels');
  });

  it('floors check-in at the server’s today, not the browser’s', async () => {
    propertiesApi.mockResolvedValue([]);

    const { container } = await renderHome();

    const today = new Date().toISOString().slice(0, 10);
    const checkIn = container.querySelector('input[type="date"]');
    expect(checkIn?.getAttribute('min')).toBe(today);
  });
});

describe('what the homepage refuses to invent', () => {
  it('publishes no statistic, rating, testimonial or experience', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderHome();
    const text = container.textContent ?? '';

    // Every one of these appears on the visual reference and none of them
    // exists as data: `review` and `property_experience` are empty tables, and
    // no endpoint reports a founding year or a guest total at all.
    expect(text).not.toMatch(/1998|Founded|Years of Hospitality/i);
    expect(text).not.toMatch(/Guests Welcomed|Total Stays|Guest Satisfaction/i);
    expect(text).not.toMatch(/\d\.\d\s*\/\s*5|reviews?\b/i);
    expect(text).not.toMatch(/Signature Experiences/i);
    // No star glyphs standing in for a rating nobody submitted.
    expect(text).not.toMatch(/★/);
  });

  it('states no portfolio size of its own', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderHome();

    // "Eight distinctive hotels" is true of the seed data and false of the
    // published portfolio, which is what this page shows. One returned hotel
    // must not be described as eight.
    expect(container.textContent ?? '').not.toMatch(/\bEight\b|\b8 (hotels|properties)\b/i);
  });
});
