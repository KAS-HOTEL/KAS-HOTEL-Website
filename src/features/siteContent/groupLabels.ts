/** Readable names for the website image-slot groups; an unknown group shows its key. */
const GROUP_LABELS: Readonly<Record<string, string>> = {
  home: 'Trang chủ',
  homeHero: 'Trang chủ · Slideshow đầu trang',
  pageHero: 'Ảnh đầu trang các trang',
  findYourKas: 'Find Your KAS',
  guidebook: 'Cẩm nang (Guidebook & câu chuyện)',
};

export function slotGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}
