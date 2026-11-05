// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let params: Record<string, string | string[]> = {};
let pathname: string | null = '/partner/properties';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => params,
  usePathname: () => pathname,
}));

const { PropertySwitcherControl, destinationFor } = await import('./PropertySwitcherControl');

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  params = {};
  pathname = '/partner/properties';
});

const properties = [
  { id: 'p1', label: 'hotel-alpha' },
  { id: 'p2', label: 'hotel-beta' },
];

describe('PropertySwitcherControl', () => {
  it('navigates to the chosen property rather than mutating any state', async () => {
    render(<PropertySwitcherControl properties={properties} />);

    await userEvent.selectOptions(screen.getByLabelText('Khách sạn đang chọn'), 'p2');

    // The URL is the property context: shareable, bookmarkable, and correct in
    // two tabs at once. Nothing tells the backend "I am looking at this hotel".
    expect(push).toHaveBeenCalledWith('/partner/properties/p2');
  });

  it('reads the active property from the route, not from memory', () => {
    params = { propertyId: 'p2' };
    render(<PropertySwitcherControl properties={properties} />);

    const select = screen.getByLabelText('Khách sạn đang chọn') as HTMLSelectElement;
    expect(select.value).toBe('p2');
  });

  it('stores nothing anywhere', async () => {
    render(<PropertySwitcherControl properties={properties} />);
    await userEvent.selectOptions(screen.getByLabelText('Khách sạn đang chọn'), 'p1');

    // A remembered property id would be a stale second copy of the URL; a
    // remembered property object would be a copy of scope-authorised data.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('p1');
  });

  it('passes a load failure through as a message, not as an empty list', () => {
    render(<PropertySwitcherControl properties={[]} error="Không thể tải danh sách khách sạn." />);

    expect(screen.getByRole('alert').textContent).toContain('Không thể tải danh sách khách sạn.');
    expect(screen.queryByText('Chưa có khách sạn nào')).toBeNull();
  });

  it('shows an empty scope without alarming the operator', () => {
    render(<PropertySwitcherControl properties={[]} />);

    expect(screen.getByText('Chưa có khách sạn nào')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the section it was used from', async () => {
    params = { propertyId: 'p1' };
    pathname = '/partner/properties/p1/calendar';
    render(<PropertySwitcherControl properties={properties} />);

    await userEvent.selectOptions(screen.getByLabelText('Khách sạn đang chọn'), 'p2');

    // Switching hotels while pricing means "price the other hotel", not "start
    // again from its overview". Eight hotels used to be eight round trips.
    expect(push).toHaveBeenCalledWith('/partner/properties/p2/calendar');
  });
});

describe('destinationFor', () => {
  it('carries every section addressed by the property alone', () => {
    for (const section of [
      'information',
      'rooms',
      'media',
      'calendar',
      'rates',
      'policies',
    ]) {
      expect(destinationFor(`/partner/properties/p1/${section}`, 'p2')).toBe(
        `/partner/properties/p2/${section}`,
      );
    }
  });

  it('drops a section addressed by an id belonging to the property being left', () => {
    // `roomTypeId` is p1's. Carrying the path across would produce a not-found
    // page for a hotel that is perfectly fine — so the overview is the answer.
    expect(destinationFor('/partner/properties/p1/rooms/rt-9/media', 'p2')).toBe(
      '/partner/properties/p2',
    );
    expect(destinationFor('/partner/properties/p1/rooms/rt-9/edit', 'p2')).toBe(
      '/partner/properties/p2',
    );
    expect(destinationFor('/partner/properties/p1/rooms/new', 'p2')).toBe(
      '/partner/properties/p2',
    );
  });

  it('lands on the property when the switcher was used from somewhere else', () => {
    expect(destinationFor('/partner/properties', 'p2')).toBe('/partner/properties/p2');
    expect(destinationFor('/partner/messages', 'p2')).toBe('/partner/properties/p2');
    expect(destinationFor('/partner/reservations/KAS-1', 'p2')).toBe('/partner/properties/p2');
    expect(destinationFor(null, 'p2')).toBe('/partner/properties/p2');
  });

  it('does not treat a made-up section as one it knows', () => {
    // An invented segment must not be carried across on the assumption it
    // exists under the other property.
    expect(destinationFor('/partner/properties/p1/analytics', 'p2')).toBe(
      '/partner/properties/p2',
    );
  });
});
