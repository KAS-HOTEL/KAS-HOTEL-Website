import { BuildingIcon, GuestsIcon, InboxIcon, LayoutIcon, MailIcon, TagIcon } from '@/ui/icons';
import type { ConsoleRole } from '@/lib/domain/session';
import type { NavSection } from './AppShell';

/**
 * The two consoles, one per role, sharing no function.
 *
 * <h2>The menu follows the permissions</h2>
 *
 * `RoleCatalogue` splits the catalogue in two, and each role is the highest
 * authority over its half. ADMIN owns hotels, rates, media, guest reviews and
 * website content. SUPER_ADMIN owns bookings, customers, vouchers, messages and the payment account.
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
      { label: 'Danh sách khách sạn', href: '/partner/properties', status: 'available', icon: <BuildingIcon /> },
      { label: 'Hồ sơ chờ duyệt', href: '/admin/review', status: 'available', icon: <InboxIcon /> },
      { label: 'Chính sách dùng chung', href: '/partner/policies', status: 'available', icon: <LayoutIcon /> },
      { label: 'Điểm Trip.com', href: '/admin/properties', status: 'available', icon: <LayoutIcon /> },
    ],
  },
  {
    heading: 'Khách hàng',
    items: [{ label: 'Đánh giá', href: '/admin/reviews', status: 'available', icon: <InboxIcon /> }],
  },
  {
    heading: 'Nội dung website',
    items: [
      { label: 'Ảnh website', href: '/admin/content/images', status: 'available', icon: <LayoutIcon /> },
      { label: 'KAS Collection', href: '/admin/collection', status: 'available', icon: <BuildingIcon /> },
      { label: 'Bản đồ section', href: '/admin/content/map', status: 'available', icon: <LayoutIcon /> },
      { label: 'Nguồn ảnh', href: '/admin/content/sources', status: 'available', icon: <LayoutIcon /> },
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
      { label: 'Tin nhắn', href: '/partner/messages', status: 'available', icon: <MailIcon /> },
    ],
  },
  {
    heading: 'Khách hàng',
    items: [{ label: 'Danh sách khách hàng', href: '/admin/customers', status: 'available', icon: <GuestsIcon /> }],
  },
  {
    heading: 'Ưu đãi',
    items: [{ label: 'Voucher', href: '/admin/vouchers', status: 'available', icon: <TagIcon /> }],
  },
  {
    heading: 'Thanh toán',
    // One account for every hotel (V51); SUPER_ADMIN confirms the payments made into it.
    items: [{ label: 'Tài khoản thanh toán', href: '/partner/payment-account', status: 'available', icon: <TagIcon /> }],
  },
];

/** An unknown role gets the smaller menu; the backend refuses anything beyond it. */
export function navFor(role: ConsoleRole | null): readonly NavSection[] {
  return role === 'SUPER_ADMIN' ? SUPER_ADMIN_NAV : ADMIN_NAV;
}

export function consoleWordmark(role: ConsoleRole | null): string {
  return role === 'SUPER_ADMIN' ? 'KAS Super Admin' : 'KAS Admin';
}
