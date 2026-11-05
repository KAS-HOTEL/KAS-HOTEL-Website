// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoomTypeView } from '@/lib/domain/roomType';
import {
  formatBeds,
  isRoomTypePubliclyVisible,
  ROOM_TYPE_STATUSES,
  roomTypeName,
  roomTypeStatusLabel,
  roomTypeStatusTone,
  viewTypeLabel,
} from '@/lib/domain/roomType';
import { RoomTypeDetailView } from './RoomTypeDetailView';
import { RoomTypeStatusBadge } from './RoomTypeStatusBadge';
import { RoomTypeCards } from './RoomTypeCards';
import { RoomTypeTable } from './RoomTypeTable';

afterEach(cleanup);

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';

/** Synthetic. Real seed slugs would couple the frontend to today's database. */
function roomAt(index: number, overrides: Partial<RoomTypeView> = {}): RoomTypeView {
  return {
    id: `0000000${index}-0000-4000-8000-000000000000`,
    slug: `room-${index}`,
    translations: {
      vi: { name: `Phòng Số ${index}`, shortDescription: 'Rộng rãi' },
      en: { name: `Room Number ${index}` },
    },
    status: 'DRAFT',
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    smoking: false,
    sortOrder: index,
    beds: [{ bedType: 'King', bedCount: 1, isDefault: true, sortOrder: 0 }],
    amenityCodes: ['wifi', 'air_conditioning'],
    version: 0,
    ...overrides,
  };
}

describe('room type domain', () => {
  it('carries exactly the four frozen statuses', () => {
    expect(ROOM_TYPE_STATUSES).toEqual(['DRAFT', 'PUBLISHED', 'UNLISTED', 'ARCHIVED']);
  });

  it('translates a status without reinterpreting it', () => {
    // UNLISTED is "withdrawn from the public site", not "hidden" or "off" —
    // those would read as a toggle rather than a lifecycle state.
    expect(roomTypeStatusLabel('UNLISTED')).toBe('Đã gỡ hiển thị');
    expect(roomTypeStatusLabel('UNLISTED')).not.toMatch(/tắt|ẩn/i);
    expect(roomTypeStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(roomTypeStatusTone('SOMETHING_NEW')).toBe('neutral');
  });

  it('mirrors isPubliclyVisible() exactly — PUBLISHED only', () => {
    // Doc 52 §3.2. Pinned per status so a drift from the backend enum fails here
    // rather than telling a Partner their draft room is live.
    expect(isRoomTypePubliclyVisible('PUBLISHED')).toBe(true);
    for (const status of ['DRAFT', 'UNLISTED', 'ARCHIVED']) {
      expect(isRoomTypePubliclyVisible(status)).toBe(false);
    }
  });

  it('labels every frozen view type and passes an unknown one through', () => {
    for (const view of ['CITY', 'STREET', 'COURTYARD', 'ROOFTOP', 'INTERIOR']) {
      expect(viewTypeLabel(view)).not.toBe(view);
    }
    // Doc 94 records that view_type was deliberately not extended, so an
    // unrecognised value is shown as itself rather than mapped onto a neighbour.
    expect(viewTypeLabel('GARDEN')).toBe('GARDEN');
  });

  it('prefers the Vietnamese name and returns null when there is none', () => {
    expect(roomTypeName({ vi: { name: 'Phòng A' }, en: { name: 'Room A' } })).toBe('Phòng A');
    expect(roomTypeName({ en: { name: 'Room A' } })).toBe('Room A');
    // Not the slug: falling back here would make an unnamed room
    // indistinguishable from a named one at every call site.
    expect(roomTypeName({})).toBeNull();
  });

  it('formats beds in the backend’s own order', () => {
    expect(
      formatBeds([
        { bedType: 'Twin', bedCount: 2, isDefault: false, sortOrder: 1 },
        { bedType: 'King', bedCount: 1, isDefault: true, sortOrder: 0 },
      ]),
    ).toBe('1 × King · 2 × Twin');
    expect(formatBeds([])).toBe('');
  });
});

describe('RoomTypeTable', () => {
  it('renders exactly the rows the backend returned', () => {
    render(
      <RoomTypeTable propertyId={PROPERTY_ID} roomTypes={[roomAt(1), roomAt(2), roomAt(3)]} />,
    );
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
  });

  it('links each room by id, under its property', () => {
    render(<RoomTypeTable propertyId={PROPERTY_ID} roomTypes={[roomAt(4)]} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      `/partner/properties/${PROPERTY_ID}/rooms/00000004-0000-4000-8000-000000000000`,
    );
  });

  it('shows the three occupancy numbers rather than one summarised figure', () => {
    render(<RoomTypeTable propertyId={PROPERTY_ID} roomTypes={[roomAt(1)]} />);

    // max_occupancy <= max_adults + max_children is a CHECK, not an identity, so
    // 2 + 1 does not have to equal 3 and must not be asserted by the UI.
    expect(screen.getByText('3 khách')).toBeTruthy();
    expect(screen.getByText('2 người lớn · 1 trẻ em')).toBeTruthy();
  });

  it('never manufactures a name from the slug', () => {
    render(
      <RoomTypeTable
        propertyId={PROPERTY_ID}
        roomTypes={[roomAt(1, { translations: {}, slug: 'deluxe-king' })]}
      />,
    );
    expect(screen.queryByText('Deluxe King')).toBeNull();
    expect(screen.getByText('Chưa đặt tên')).toBeTruthy();
    expect(screen.getByText('deluxe-king')).toBeTruthy();
  });

  it('marks unset optional fields rather than leaving blank cells', () => {
    render(
      <RoomTypeTable
        propertyId={PROPERTY_ID}
        roomTypes={[roomAt(1, { beds: [], amenityCodes: [] })]}
      />,
    );
    expect(screen.getByLabelText('Chưa cấu hình')).toBeTruthy();
    expect(screen.getAllByLabelText('Chưa đặt').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a useful empty state, because every seed property is in it', () => {
    render(<RoomTypeTable propertyId={PROPERTY_ID} roomTypes={[]} />);

    expect(screen.getByText('Khách sạn này chưa có loại phòng nào')).toBeTruthy();
    // It has to explain the concept and the route forward, not look broken.
    expect(screen.getByText(/Loại phòng là sản phẩm khách đặt/)).toBeTruthy();
    expect(screen.getByText(/bước tiếp theo/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('is busy while loading, and invents no placeholder rooms', () => {
    render(<RoomTypeTable propertyId={PROPERTY_ID} roomTypes={[]} loading />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/mẫu|sample|demo/i)).toBeNull();
  });

  it('shows no price and no physical-room identity', () => {
    render(<RoomTypeTable propertyId={PROPERTY_ID} roomTypes={[roomAt(1)]} />);
    const table = screen.getByRole('table');

    // The API returns no price (doc 52 §3.2 keeps it in `pricing`) and no field
    // capable of holding a room number (doc 52 §6). No column may imply either.
    expect(table.textContent).not.toMatch(/giá|price|VND|số phòng|tầng|floor/i);
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
  });
});

describe('RoomTypeStatusBadge', () => {
  it('keeps the backend value alongside the translation', () => {
    const { container } = render(<RoomTypeStatusBadge status="UNLISTED" />);
    expect(screen.getByText('Đã gỡ hiển thị')).toBeTruthy();
    expect(container.querySelector('[data-room-status="UNLISTED"]')).toBeTruthy();
  });

  it('renders all four statuses distinctly', () => {
    const seen = new Set<string>();
    for (const status of ROOM_TYPE_STATUSES) {
      const { container, unmount } = render(<RoomTypeStatusBadge status={status} />);
      seen.add(container.textContent ?? '');
      unmount();
    }
    expect(seen.size).toBe(4);
  });
});

describe('RoomTypeDetailView', () => {
  const roomType = roomAt(7, {
    viewType: 'CITY',
    areaSqm: 32.5,
    beds: [
      { bedType: 'King', bedCount: 1, isDefault: true, sortOrder: 0 },
      { bedType: 'Sofa', bedCount: 1, isDefault: false, sortOrder: 1 },
    ],
  });

  it('has one heading, and it is the room’s name', () => {
    render(<RoomTypeDetailView propertyId={PROPERTY_ID} roomType={roomType} />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Phòng Số 7');
  });

  it('shows both locales explicitly, including one that is missing', () => {
    render(
      <RoomTypeDetailView
        propertyId={PROPERTY_ID}
        roomType={roomAt(7, { translations: { vi: { name: 'Chỉ Tiếng Việt' } } })}
      />,
    );
    expect(screen.getByText('Tiếng Việt (vi)')).toBeTruthy();
    expect(screen.getByText('English (en)')).toBeTruthy();
    expect(screen.getAllByText('Chưa đặt').length).toBeGreaterThanOrEqual(1);
  });

  it('renders every field the endpoint returns', () => {
    render(<RoomTypeDetailView propertyId={PROPERTY_ID} roomType={roomType} />);

    expect(screen.getByText('Hướng thành phố')).toBeTruthy();
    expect(screen.getByText('32.5 m²')).toBeTruthy();
    expect(screen.getByText('1 × King')).toBeTruthy();
    expect(screen.getByText('Mặc định')).toBeTruthy();
    expect(screen.getByText('wifi')).toBeTruthy();
    expect(screen.getByText(roomType.id)).toBeTruthy();
    // Translated status plus the raw backend value.
    expect(screen.getByText('Bản nháp (DRAFT)')).toBeTruthy();
  });

  it('states that the Partner cannot publish, and offers no control that would', () => {
    render(<RoomTypeDetailView propertyId={PROPERTY_ID} roomType={roomType} />);

    // RoomTypeStatus.isPartnerPermittedTransition refuses PUBLISHED outright, so
    // a publish button would come back 409. The page says how publication works.
    expect(screen.getByText(/Đối tác không thể tự đăng loại phòng/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('says a draft room is not visible to guests', () => {
    render(<RoomTypeDetailView propertyId={PROPERTY_ID} roomType={roomType} />);
    expect(screen.getByText('Không — loại phòng này chưa hiển thị với khách.')).toBeTruthy();
  });

  it('names the future room screens as disabled, not as working links', () => {
    render(<RoomTypeDetailView propertyId={PROPERTY_ID} roomType={roomType} />);

    const tabs = screen.getByRole('navigation', { name: 'Khu vực quản lý loại phòng' });
    // "Hình ảnh" joined the working links in STEP H: the room gallery is real —
    // upload to R2, reorder, set the primary photo — so leaving it greyed out
    // would now be the lie.
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Tổng quan',
      'Hình ảnh',
    ]);

    // The two still-unbuilt areas are named and marked disabled — the assertion
    // the test's own title makes. It used to match "(Bước 9)" and friends; the
    // release numbers were removed from the labels because they mean nothing to
    // a hotel operator, and the invariant worth holding is that these are not
    // links, not that they carry a step number.
    const disabled = within(tabs).getAllByText(/^Giá$/);
    expect(disabled).toHaveLength(1);
    for (const tab of disabled) {
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      expect(tab.tagName).not.toBe('A');
    }
    expect(within(tabs).queryByText(/Bước/)).toBeNull();
  });

  it('shows empty states for beds and amenities rather than blank cards', () => {
    render(
      <RoomTypeDetailView
        propertyId={PROPERTY_ID}
        roomType={roomAt(7, { beds: [], amenityCodes: [] })}
      />,
    );
    expect(screen.getByText('Chưa cấu hình giường')).toBeTruthy();
    expect(screen.getByText('Chưa chọn tiện nghi')).toBeTruthy();
  });

  it('exposes no price, no propertyId and no partner reference', () => {
    const { container } = render(
      <RoomTypeDetailView propertyId={PROPERTY_ID} roomType={roomType} />,
    );
    // The tab strip is excluded on purpose: it names the future Giá screen, and
    // naming where a feature is going is not the same as showing a price.
    const tabs = screen.getByRole('navigation', { name: 'Khu vực quản lý loại phòng' });
    const body = [...container.querySelectorAll('section')]
      .filter((section) => !tabs.contains(section))
      .map((section) => section.textContent ?? '')
      .join(' ');

    expect(body).not.toMatch(/giá|price|VND|partnerId/i);
    // The property id appears only inside hrefs, never as displayed content.
    expect(container.textContent ?? '').not.toContain(PROPERTY_ID);
  });
});

describe('RoomTypeCards — the narrow-width shape', () => {
  const room = roomAt(3, {
    viewType: 'CITY',
    areaSqm: 28,
    beds: [{ bedType: 'King', bedCount: 1, isDefault: true, sortOrder: 0 }],
  });

  it('carries every column the table carries, not a reduced set', () => {
    render(<RoomTypeCards propertyId={PROPERTY_ID} roomTypes={[room]} />);

    // A phone user is not given less information — the same facts, stacked.
    expect(screen.getByText('Phòng Số 3')).toBeTruthy();
    expect(screen.getByText('room-3')).toBeTruthy();
    expect(screen.getByText('Sức chứa')).toBeTruthy();
    expect(screen.getByText('Giường')).toBeTruthy();
    expect(screen.getByText('Hướng nhìn')).toBeTruthy();
    expect(screen.getByText('Diện tích')).toBeTruthy();
  });

  it('keeps the three occupancy numbers separate, as the schema does', () => {
    const { container } = render(<RoomTypeCards propertyId={PROPERTY_ID} roomTypes={[room]} />);
    const text = container.textContent ?? '';

    // max_occupancy <= max_adults + max_children is a CHECK, not an identity,
    // so collapsing them into one figure would assert a sum the schema does not.
    expect(text).toContain('3 khách');
    expect(text).toContain('2 người lớn');
    expect(text).toContain('1 trẻ em');
  });

  it('links the whole card to the room, so the tap target is the card', () => {
    render(<RoomTypeCards propertyId={PROPERTY_ID} roomTypes={[room]} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(
      `/partner/properties/${PROPERTY_ID}/rooms/${room.id}`,
    );
    expect(link.textContent).toContain('Phòng Số 3');
  });

  it('marks unset optional fields rather than leaving them blank', () => {
    render(
      <RoomTypeCards
        propertyId={PROPERTY_ID}
        roomTypes={[roomAt(4, { beds: [] })]}
      />,
    );

    expect(screen.getByText('Chưa cấu hình')).toBeTruthy();
    // View and area are absent on this fixture.
    expect(screen.getAllByText('Chưa đặt').length).toBeGreaterThan(0);
  });

  it('shows no price, because the endpoint returns none', () => {
    const { container } = render(<RoomTypeCards propertyId={PROPERTY_ID} roomTypes={[room]} />);
    expect(container.textContent ?? '').not.toMatch(/₫|VND|giá/i);
  });
});
