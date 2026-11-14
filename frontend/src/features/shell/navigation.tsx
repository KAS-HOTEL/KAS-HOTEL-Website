import { BuildingIcon, CalendarIcon, GuestsIcon, InboxIcon, LayoutIcon, TagIcon } from '@/ui/icons';
import type { ConsoleRole } from '@/lib/domain/session';
import type { NavSection } from './AppShell';

/**
 * The two consoles, one per role, sharing no function.
 *
 * <h2>The menu follows the permissions</h2>
 *
 * `RoleCatalogue` splits the catalogue in two, and each role is the highest
 * authority over its half. ADMIN owns hotels with their room types, media and
 * website content. SUPER_ADMIN owns bookings, customers, guest reviews, room prices,
 * surcharges, vouchers, messages and the payment account.
 *
 * <p>2026-11-08: the Admin menu was reduced to what production uses. "Hồ sơ chờ
 * duyệt", "Điểm Trip.com", "KAS Collection", "Bản đồ section" and "Nguồn ảnh" were
 * removed (a hotel is published from its own page; its Hero image is its cover
 * everywhere), and guest reviews moved to SUPER_ADMIN.
 * `ConsoleRoleIT` proves the split against the endpoints.
 *
 * <p>A menu is navigation, not authorisation: every action is still decided by the
 * backend. The URLs stay under `/admin` and `/partner`, where those screens have
 * always lived, because a person's console depends on their role and not the path.
 *
 * <p>Every item is marked `available` only when a real backend endpoint exists,
 * so the shell never presents a capability the product does not have.
 */
export const ADMIN_NAV: readonly NavSection[] = [
  { items: [{ label: 'Tổng quan', href: '/admin', status: 'available', icon: <LayoutIcon /> }] },
  {
    heading: 'Khách sạn',
    items: [
      // Room types are managed inside each hotel, never on a page of their own.
      { label: 'Khách sạn & Hạng phòng', href: '/partner/properties', status: 'available', icon: <BuildingIcon /> },
      // "Chính sách dùng chung" (/partner/policies) is hidden from the menu (owner, 2026-11-08);
      // the screen and its API stay in place.
    ],
  },
  {
    heading: 'Nội dung website',
    // In website order (owner decision, 2026-11-08): the homepage, the page heroes, hotel and
    // room photos, then the Guidebook.
    items: [
      { label: 'Trang chủ', href: '/admin/content/home', status: 'available', icon: <LayoutIcon /> },
      { label: 'Ảnh Hero các trang', href: '/admin/content/heroes', status: 'available', icon: <LayoutIcon /> },
      { label: 'Ảnh khách sạn & hạng phòng', href: '/admin/content/hotels', status: 'available', icon: <BuildingIcon /> },
      { label: 'Guidebook', href: '/admin/content/guidebook', status: 'available', icon: <InboxIcon /> },
    ],
  },
];

export const SUPER_ADMIN_NAV: readonly NavSection[] = [
  { heading: 'Tổng quan', items: [{ label: 'Tổng quan', href: '/partner', status: 'available', icon: <LayoutIcon /> }] },
  {
    heading: 'Vận hành',
    items: [
      /*
        Two separate items, deliberately: the request queue is the direct sales
        lifecycle (`salesStatus`), the reservations list is the stay lifecycle
        (`stayStatus`). Their statuses are different machines and are not merged.
      */
      { label: 'Yêu cầu đặt phòng', href: '/partner/requests', status: 'available', icon: <InboxIcon /> },
      { label: 'Đặt phòng & khách lưu trú', href: '/partner/reservations', status: 'available', icon: <GuestsIcon /> },
      { label: 'Yêu cầu hủy', href: '/partner/cancellation-requests', status: 'available', icon: <InboxIcon /> },
      // SePay money that could not confirm a booking (V66, 2026-11-10): late, cancelled, twice, wrong amount.
      { label: 'Tiền chưa khớp đơn', href: '/partner/unmatched-payments', status: 'available', icon: <InboxIcon /> },
    ],
  },
  {
    // Room prices moved from ADMIN to SUPER_ADMIN (2026-11-08). "Phụ thu" is hidden for now
    // (owner, 2026-11-08): surcharges are not added to the room price — reception collects
    // them at check-in. The /partner/surcharges screen and its API stay in place.
    heading: 'Giá phòng',
    items: [
      { label: 'Giá phòng', href: '/partner/pricing', status: 'available', icon: <CalendarIcon /> },
      // Late-cancellation fees (2026-11-10): charged after the member / guest free window.
      { label: 'Phí huỷ phòng', href: '/partner/cancellation-fees', status: 'available', icon: <TagIcon /> },
    ],
  },
  {
    heading: 'Khách hàng',
    items: [
      { label: 'Danh sách khách hàng', href: '/admin/customers', status: 'available', icon: <GuestsIcon /> },
      { label: 'Đánh giá', href: '/admin/reviews', status: 'available', icon: <InboxIcon /> },
    ],
  },
  {
    heading: 'Ưu đãi',
    items: [{ label: 'Voucher', href: '/admin/vouchers', status: 'available', icon: <TagIcon /> }],
  },
  // "Thanh toán → Tài khoản thanh toán" (static QR / manual transfer, V51) is hidden while KAS
  // takes payments through SePay (owner 2026-11-12). The page, its API and the stored account
  // stay as they are, so it can come back by restoring this section.
];

/** An unknown role gets the smaller menu; the backend refuses anything beyond it. */
export function navFor(role: ConsoleRole | null): readonly NavSection[] {
  return role === 'SUPER_ADMIN' ? SUPER_ADMIN_NAV : ADMIN_NAV;
}

export function consoleWordmark(role: ConsoleRole | null): string {
  return role === 'SUPER_ADMIN' ? 'KAS Super Admin' : 'KAS Admin';
}
