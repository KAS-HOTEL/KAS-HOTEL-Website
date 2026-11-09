import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';

/**
 * Where each website image slot appears, in the website's own order (owner decision,
 * 2026-11-08). The slots themselves live in `site_image_slot`; this file only names and
 * groups them for the console's "Nội dung website" screens, so the database labels do not
 * have to change. A slot the database has but this catalogue does not list is simply not
 * shown; a listed slot the database lacks is shown as missing.
 */

export type ContentPage = 'home' | 'heroes' | 'guidebook';

export interface CatalogueSlot {
  readonly key: string;
  readonly label: string;
  /** Slideshow position, for the Ảnh Zero. */
  readonly order?: number;
  /** Where on the page the image is shown, when the label alone does not say. */
  readonly where?: string;
  /** Guidebook chapters that show this place's photo. */
  readonly chapters?: readonly GuideChapter[];
}

export interface CatalogueBlock {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Card size: many small slideshow cards, or a few wide ones. */
  readonly layout: 'compact' | 'wide';
  readonly slots: readonly CatalogueSlot[];
}

export interface CataloguePage {
  readonly id: ContentPage;
  readonly title: string;
  readonly description: string;
  /** The website page to open beside the editor. */
  readonly websitePath: string;
  readonly blocks: readonly CatalogueBlock[];
}

const ZERO_KEYS = [
  'home.hero.01', 'home.hero.02', 'home.hero.03', 'home.hero.04', 'home.hero.05', 'home.hero.06',
  'home.hero.07', 'home.hero.08', 'home.heroExtra1', 'home.heroExtra2', 'home.heroExtra3', 'home.heroExtra4',
] as const;

export type GuideChapter = 'city' | 'taste' | 'slow' | 'night';

export const GUIDE_CHAPTER_LABEL: Readonly<Record<GuideChapter, string>> = {
  city: 'Trung tâm',
  taste: 'Ẩm thực',
  slow: 'Lang thang',
  night: 'Về đêm',
};

/**
 * One photo per real place. A place that appears in several chapters (js/guide-data.js gives
 * each appearance its own id, e.g. `ben-thanh-market-walk`) shares its base place's photo;
 * js/guide-book.js applies the same aliases on the website.
 */
const GUIDE_PLACES: readonly (readonly [id: string, name: string, chapters: readonly GuideChapter[]])[] = [
  ['ben-thanh-market', 'Chợ Bến Thành', ['city', 'taste', 'slow', 'night']],
  ['tao-dan-park', 'Công viên Tao Đàn', ['city']],
  ['independence-palace', 'Dinh Độc Lập', ['city']],
  ['war-remnants-museum', 'Bảo tàng Chứng tích Chiến tranh', ['city']],
  ['central-post-office', 'Bưu điện Trung tâm Sài Gòn', ['city', 'slow']],
  ['notre-dame-cathedral', 'Nhà thờ Đức Bà Sài Gòn', ['city', 'slow']],
  ['saigon-opera-house', 'Nhà hát Thành phố', ['city', 'slow', 'night']],
  ['nguyen-hue', 'Phố đi bộ Nguyễn Huệ', ['city', 'slow', 'night']],
  ['bitexco', 'Tòa nhà Bitexco Financial Tower', ['city', 'slow', 'night']],
  ['saigon-square', 'Saigon Square', ['city', 'slow']],
  ['ben-thanh-street-food', 'Chợ Ẩm thực Bến Thành', ['taste']],
  ['pham-ngu-lao', 'Phạm Ngũ Lão', ['taste', 'night']],
  ['bui-vien', 'Phố đi bộ Bùi Viện', ['taste', 'night']],
  ['fine-arts-museum', 'Bảo tàng Mỹ thuật TP. Hồ Chí Minh', ['taste']],
  ['nguyen-trai-street', 'Đường Nguyễn Trãi', ['taste']],
  ['saigon-centre', 'Saigon Centre / Takashimaya', ['taste']],
  ['saigon-eco-craft', 'Saigon Eco Craft', ['taste']],
  ['vietnamese-coffee', 'Những điểm uống cà phê Việt', ['taste']],
  ['saigon-street-food', 'Dạo ẩm thực đường phố Sài Gòn', ['taste']],
  ['gia-long-palace', 'Dinh Gia Long / Bảo tàng Thành phố', ['slow']],
  ['le-thanh-ton', 'Dạo phố Lê Thánh Tôn', ['slow']],
  ['saigon-zoo', 'Thảo Cầm Viên Sài Gòn', ['slow']],
  ['bui-thi-xuan', 'Bùi Thị Xuân', ['night']],
  ['september-23-park', 'Công viên 23 Tháng 9', ['night']],
  ['ao-show', 'A O Show / Lune Production', ['night']],
  ['late-night-food', 'Ẩm thực Việt về đêm', ['night']],
];

/** Guidebook entry ids that show another place's photo (mirrors js/guide-book.js). */
export const GUIDE_PHOTO_ALIASES: Readonly<Record<string, string>> = {
  'ben-thanh-market-food': 'ben-thanh-market',
  'ben-thanh-market-walk': 'ben-thanh-market',
  'ben-thanh-night': 'ben-thanh-market',
  'central-post-office-walk': 'central-post-office',
  'notre-dame-cathedral-walk': 'notre-dame-cathedral',
  'saigon-opera-house-walk': 'saigon-opera-house',
  'saigon-opera-house-night': 'saigon-opera-house',
  'nguyen-hue-walk': 'nguyen-hue',
  'nguyen-hue-night': 'nguyen-hue',
  'bitexco-walk': 'bitexco',
  'bitexco-night': 'bitexco',
  'saigon-square-walk': 'saigon-square',
  'pham-ngu-lao-night': 'pham-ngu-lao',
  'bui-vien-night': 'bui-vien',
};

export const GUIDE_PLACE_IDS: readonly string[] = GUIDE_PLACES.map(([id]) => id);

export const CONTENT_PAGES: readonly CataloguePage[] = [
  {
    id: 'home',
    title: 'Trang chủ',
    description: 'Ảnh Zero, Welcome Popup và ảnh các section của trang chủ.',
    websitePath: '/',
    blocks: [
      {
        id: 'zero',
        title: 'Ảnh Zero',
        description: '12 ảnh chạy lần lượt ở đầu trang chủ, theo thứ tự 01 → 12. Muốn đổi thứ tự, thay ảnh giữa các vị trí.',
        layout: 'compact',
        slots: ZERO_KEYS.map((key, index) => ({
          key,
          label: `Ảnh Zero ${String(index + 1).padStart(2, '0')}`,
          order: index + 1,
        })),
      },
      {
        id: 'welcome',
        title: 'Welcome Popup',
        description: 'Ảnh bên trái cửa sổ chào mừng, hiện khi khách vào website lần đầu.',
        layout: 'wide',
        slots: [{ key: 'page.hero.welcome', label: 'Ảnh cửa sổ chào mừng' }],
      },
      {
        id: 'sections',
        title: 'Ảnh các section trang chủ',
        description: 'Mỗi section một ảnh, theo thứ tự xuất hiện trên trang chủ.',
        layout: 'wide',
        slots: [
          { key: 'home.dayInSaigon', label: 'Thành phố của những tương phản', where: 'Section “Theo nhịp thành phố”' },
          { key: 'home.neighborhood.city', label: 'Cẩm nang thành phố KAS', where: 'Section “Bốn câu chuyện khu phố”' },
          { key: 'home.roomsSuites', label: 'Một căn phòng đúng với bạn.', where: 'Section “Rooms & Suites”' },
        ],
      },
    ],
  },
  {
    id: 'heroes',
    title: 'Ảnh Hero các trang',
    description: 'Ảnh ở đầu 6 trang nội dung, theo thứ tự menu của website.',
    websitePath: '/hotels.html',
    blocks: [
      {
        id: 'heroes',
        title: 'Ảnh đầu trang',
        description: 'Ảnh lớn ở đầu mỗi trang. Ảnh từng khách sạn quản lý trong “Ảnh khách sạn & hạng phòng”.',
        layout: 'wide',
        slots: [
          { key: 'page.hero.hotels', label: 'Khách sạn' },
          { key: 'page.hero.experiences', label: 'Trải nghiệm' },
          { key: 'page.hero.offers', label: 'Ưu đãi' },
          { key: 'page.hero.my-kas', label: 'My KAS' },
          { key: 'page.hero.about', label: 'Về KAS' },
          { key: 'page.hero.support', label: 'Hỗ trợ' },
        ],
      },
    ],
  },
  {
    id: 'guidebook',
    title: 'Guidebook',
    description: 'Ảnh bìa và ảnh các địa điểm của cẩm nang thành phố.',
    websitePath: '/city-guide.html',
    blocks: [
      {
        id: 'cover',
        title: 'Ảnh bìa',
        description: 'Ảnh lớn ở đầu cẩm nang.',
        layout: 'wide',
        slots: [{ key: 'guidebook.hero', label: 'Ảnh bìa cẩm nang' }],
      },
      {
        id: 'places',
        title: 'Địa điểm',
        description: 'Mỗi địa điểm một ảnh. Địa điểm xuất hiện ở nhiều chương dùng chung một ảnh: đổi một lần là cập nhật ở mọi chương.',
        layout: 'compact',
        slots: GUIDE_PLACES.map(([id, name, chapters]) => ({ key: `guidebook.entry.${id}`, label: name, chapters })),
      },
    ],
  },
];

export function contentPage(id: ContentPage): CataloguePage {
  const page = CONTENT_PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Unknown content page ${id}`);
  return page;
}

export type SlotState = 'set' | 'default' | 'missing' | 'hidden';

export const SLOT_STATE_LABEL: Readonly<Record<SlotState, string>> = {
  set: 'Đã có ảnh',
  default: 'Ảnh mặc định',
  missing: 'Chưa có ảnh',
  hidden: 'Đang ẩn',
};

/** A slot the database does not have (or did not return) counts as missing. */
export function slotState(slot: SiteImageSlot | undefined): SlotState {
  if (!slot) return 'missing';
  if (!slot.enabled) return 'hidden';
  if (slot.currentReference) return 'set';
  if (slot.defaultReference) return 'default';
  return 'missing';
}

/** The image shown for a slot: its own, else the website default, else none. */
export function slotPreview(slot: SiteImageSlot | undefined, websiteBase?: string): string | null {
  if (!slot) return null;
  const reference = slot.currentReference || slot.defaultReference || null;
  if (!reference || !websiteBase || /^(https?:|blob:|data:)/i.test(reference)) return reference;
  // A same-site path ("/assets/…" or "assets/…") lives on the website, not on the console host.
  if (!/^\/?[\w./-]+\.(jpe?g|png|webp|avif|gif|svg)$/i.test(reference)) return reference;
  return `${websiteBase.replace(/\/+$/, '')}/${reference.replace(/^\/+/, '')}`;
}

/** HTTPS or a same-site path — the rule `AdminSiteImageSlotController` enforces. */
export function isAcceptedReference(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('/')) return !v.startsWith('//') && !v.includes('\\') && !v.includes('..');
  return /^https:\/\/[^\s]+$/i.test(v);
}
