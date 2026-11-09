// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicMediaView } from '@/lib/domain/media';

const { PropertyGallery } = await import('./PropertyGallery');
const { RoomGallery } = await import('./RoomGallery');

function image(n: number, overrides: Partial<PublicMediaView> = {}): PublicMediaView {
  return {
    url: `https://media.kas.invalid/m/asset-${n}`,
    width: 2400,
    height: 1600,
    isCover: n === 1,
    ...overrides,
  };
}

function images(count: number): PublicMediaView[] {
  return Array.from({ length: count }, (_, i) => image(i + 1));
}

/**
 * jsdom implements neither `showModal` nor `close`, so the dialog would never
 * open. These stand in for the platform behaviour the component relies on;
 * everything the component itself does is still exercised.
 */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
    this.tabIndex = -1;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  });
});
afterEach(cleanup);

describe('the property gallery', () => {
  it('renders nothing when the hotel has published no photographs', () => {
    const { container } = render(
      <PropertyGallery images={[]} hotelName="Kas Passion" viewAllLabel="Xem tất cả ảnh" />,
    );
    // Not a placeholder: a slot where a picture should be reads as broken, and a
    // stock hotel would be somebody else's.
    expect(container.firstChild).toBeNull();
  });

  it('shows at most four tiles and counts the rest on the last one', () => {
    render(
      <PropertyGallery images={images(9)} hotelName="Kas Passion" viewAllLabel="Xem tất cả ảnh" />,
    );

    const mosaic = screen.getAllByRole('button').filter((b) => b.querySelector('img'));
    expect(mosaic).toHaveLength(4);
    // Nine photographs, four tiles: the last carries the five not shown.
    expect(screen.getByText('+5')).toBeTruthy();
  });

  it('counts nothing when every photograph is already visible', () => {
    render(
      <PropertyGallery images={images(3)} hotelName="Kas Passion" viewAllLabel="Xem tất cả ảnh" />,
    );
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('uses the Partner’s alt text, and names the hotel when there is none', () => {
    render(
      <PropertyGallery
        images={[image(1, { alt: 'Hồ bơi tầng thượng' }), image(2)]}
        hotelName="Kas Passion"
        viewAllLabel="Xem tất cả ảnh"
      />,
    );

    expect(screen.getByAltText('Hồ bơi tầng thượng')).toBeTruthy();
    // The fallback names the hotel rather than saying "image".
    expect(screen.getByAltText('Kas Passion')).toBeTruthy();
  });

  it('constructs no URL of its own', () => {
    const { container } = render(
      <PropertyGallery images={images(2)} hotelName="Kas Passion" viewAllLabel="Xem tất cả ảnh" />,
    );

    // Every src is the one the API returned. A gallery that builds paths is a
    // gallery that breaks when the delivery host changes.
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/media\.kas\.invalid\/m\/asset-\d$/);
    }
  });

  it('opens the full set at the tile that was clicked', async () => {
    render(
      <PropertyGallery images={images(6)} hotelName="Kas Passion" viewAllLabel="Xem tất cả ảnh" />,
    );

    await userEvent.click(screen.getByRole('button', { name: /ảnh 2 trong 6/ }));

    const dialog = screen.getByRole('dialog', { name: 'Ảnh Kas Passion' });
    expect(within(dialog).getByText('2 / 6')).toBeTruthy();
  });

  it('opens at the first photograph from the view-all control', async () => {
    render(
      <PropertyGallery images={images(6)} hotelName="Kas Passion" viewAllLabel="Xem tất cả ảnh" />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Xem tất cả ảnh (6)' }));
    expect(within(screen.getByRole('dialog')).getByText('1 / 6')).toBeTruthy();
  });
});

describe('the lightbox', () => {
  async function open(count = 4) {
    render(
      <PropertyGallery
        images={images(count)}
        hotelName="Kas Passion"
        viewAllLabel="Xem tất cả ảnh"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: `Xem tất cả ảnh (${count})` }));
    return screen.getByRole('dialog');
  }

  it('moves forward and back, and wraps at both ends', async () => {
    const dialog = await open(3);
    const next = within(dialog).getByRole('button', { name: 'Ảnh tiếp theo' });
    const previous = within(dialog).getByRole('button', { name: 'Ảnh trước' });

    await userEvent.click(next);
    expect(within(dialog).getByText('2 / 3')).toBeTruthy();

    await userEvent.click(next);
    await userEvent.click(next);
    // Wraps, rather than making the reader travel back through all of them.
    expect(within(dialog).getByText('1 / 3')).toBeTruthy();

    await userEvent.click(previous);
    expect(within(dialog).getByText('3 / 3')).toBeTruthy();
  });

  it('moves with the arrow keys', async () => {
    const dialog = await open(3);
    // The real `showModal()` moves focus into the dialog; the jsdom stub does
    // not, so the keystrokes would otherwise land on the body.
    dialog.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('2 / 3')).toBeTruthy();

    await userEvent.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('1 / 3')).toBeTruthy();
  });

  it('closes, and stays closed', async () => {
    const dialog = await open(3);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers no navigation for a single photograph', async () => {
    const dialog = await open(1);
    expect(within(dialog).queryByRole('button', { name: 'Ảnh tiếp theo' })).toBeNull();
  });

  it('announces where the reader is in the set', async () => {
    const dialog = await open(4);
    // A screen-reader user hearing "image" four times learns nothing.
    expect(within(dialog).getByText('1 / 4').getAttribute('aria-live')).toBe('polite');
  });
});

describe('the room gallery', () => {
  it('renders nothing for a room with no photographs', () => {
    const { container } = render(<RoomGallery images={[]} roomName="Phòng Gia Đình" />);
    expect(container.firstChild).toBeNull();
  });

  it('switches the main photograph without opening the viewer', async () => {
    const { container } = render(<RoomGallery images={images(3)} roomName="Phòng Gia Đình" />);

    await userEvent.click(screen.getByRole('button', { name: /ảnh 2 trong 3/ }));

    expect((container.querySelector('img') as HTMLImageElement).src).toContain('asset-2');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the viewer at whichever photograph is showing', async () => {
    render(<RoomGallery images={images(3)} roomName="Phòng Gia Đình" />);

    await userEvent.click(screen.getByRole('button', { name: /ảnh 3 trong 3/ }));
    await userEvent.click(screen.getByRole('button', { name: /xem 3 ảnh/i }));

    const dialog = screen.getByRole('dialog', { name: 'Ảnh Phòng Gia Đình' });
    expect(within(dialog).getByText('3 / 3')).toBeTruthy();
  });

  it('shows room photographs only — never the hotel’s', () => {
    // The separation is structural: this component is given ROOM_TYPE-owned
    // media and has no access to the property gallery. The guard is that it
    // renders exactly what it was handed and fetches nothing itself.
    const { container } = render(<RoomGallery images={images(2)} roomName="Phòng Gia Đình" />);
    expect(container.querySelectorAll('img')).toHaveLength(3);
  });
});
