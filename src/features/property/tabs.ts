import type { TabItem } from '@/ui/primitives';

/** Property setup (ADMIN). Prices are SUPER_ADMIN's, under /partner/pricing. */
export function propertyTabs(propertyId: string): readonly TabItem[] {
  const at = (segment: string) => `/partner/properties/${propertyId}${segment}`;
  return [
    { id: 'overview', label: 'Tổng quan', href: at('') },
    { id: 'information', label: 'Thông tin', href: at('/information') },
    { id: 'rooms', label: 'Phòng', href: at('/rooms') },
    { id: 'media', label: 'Hình ảnh', href: at('/media') },
    { id: 'policies', label: 'Chính sách', href: at('/policies') },
  ];
}
