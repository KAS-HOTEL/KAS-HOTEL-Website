import type { PublicTripIntent } from '@/lib/domain/availability';

/** Filter properties by the current public assignments from the backend. */
export function propertiesForTripIntent<T extends { readonly slug: string }>(
  properties: readonly T[],
  intent: PublicTripIntent,
): readonly T[] {
  const included = new Set(intent.propertySlugs);
  return properties.filter((property) => included.has(property.slug));
}

export const FIND_YOUR_KAS_COPY = {
  vi: {
    eyebrow: 'Bắt đầu với nhịp điệu của bạn',
    heading: 'Bạn muốn trải nghiệm Sài Gòn như thế nào?',
    intro: 'Chọn một cách du lịch để khám phá bộ sưu tập KAS theo nhu cầu của bạn.',
    explore: 'Khám phá khách sạn phù hợp',
    footer: 'Bốn cách khám phá bộ sưu tập KAS. Đây là gợi ý biên tập, không phải bảng xếp hạng khách sạn.',
  },
  en: {
    eyebrow: 'Start with your rhythm',
    heading: 'How do you want to experience Saigon?',
    intro: 'Choose a way to travel and explore the KAS collection around your needs.',
    explore: 'Explore your KAS',
    footer: 'Four ways into the KAS collection. These are editorial suggestions, not hotel rankings.',
  },
} as const;
