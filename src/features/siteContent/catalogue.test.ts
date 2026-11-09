import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';
import {
  CONTENT_PAGES,
  GUIDE_PHOTO_ALIASES,
  GUIDE_PLACE_IDS,
  isAcceptedReference,
  slotPreview,
  slotState,
} from './catalogue';
import { websiteUrl } from './websiteUrl';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function guidePlaceIds(): string[] {
  const sandbox: { window: { KAS_GUIDE_DATA?: { places: { en: { id: string }[] } } } } = { window: {} };
  runInNewContext(readFileSync(`${ROOT}js/guide-data.js`, 'utf8'), sandbox);
  return (sandbox.window.KAS_GUIDE_DATA?.places.en ?? []).map((place) => place.id);
}

const slot = (patch: Partial<SiteImageSlot>): SiteImageSlot => ({
  key: 'k', group: 'g', label: 'l', selector: 's', defaultReference: '', currentReference: null,
  imageReference: '', enabled: true, sortOrder: 0, ...patch,
});

describe('website image catalogue', () => {
  it('lists every slot once, in four website-ordered pages', () => {
    const keys = CONTENT_PAGES.flatMap((page) => page.blocks.flatMap((block) => block.slots.map((s) => s.key)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(CONTENT_PAGES.map((page) => page.id)).toEqual(['home', 'heroes', 'guidebook']);
    const home = CONTENT_PAGES[0]!;
    expect(home.blocks.map((b) => b.slots.length)).toEqual([12, 1, 3]);
    expect(home.blocks[0]!.slots.map((s) => s.label)[11]).toBe('Ảnh Zero 12');
    expect(CONTENT_PAGES[1]!.blocks[0]!.slots).toHaveLength(6);
  });

  it('gives every Guidebook place on the website a photo, shared or its own', () => {
    for (const id of guidePlaceIds()) {
      expect(GUIDE_PLACE_IDS).toContain(GUIDE_PHOTO_ALIASES[id] ?? id);
    }
  });

  it('shares photos exactly as the website does', () => {
    const source = readFileSync(`${ROOT}js/guide-book.js`, 'utf8');
    const block = /var SHARED_PHOTO = \{([\s\S]*?)\};/.exec(source)?.[1] ?? '';
    const website = Object.fromEntries([...block.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(website).toEqual(GUIDE_PHOTO_ALIASES);
  });

  it('reads a slot state the way the editor shows it', () => {
    expect(slotState(undefined)).toBe('missing');
    expect(slotState(slot({ enabled: false, currentReference: 'https://x/a.jpg' }))).toBe('hidden');
    expect(slotState(slot({ currentReference: 'https://x/a.jpg' }))).toBe('set');
    expect(slotState(slot({ defaultReference: '/assets/a.jpg' }))).toBe('default');
    expect(slotState(slot({}))).toBe('missing');
    expect(slotPreview(slot({ currentReference: 'https://x/a.jpg', defaultReference: '/d.jpg' }))).toBe('https://x/a.jpg');
  });

  it('accepts only HTTPS or same-site paths, like the backend', () => {
    expect(isAcceptedReference('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isAcceptedReference('/assets/home/a.jpg')).toBe(true);
    expect(isAcceptedReference('http://example.com/a.jpg')).toBe(false);
    expect(isAcceptedReference('//evil.example/a.jpg')).toBe(false);
    expect(isAcceptedReference('/../secret')).toBe(false);
  });

  it('links to the website, not to the console host', () => {
    expect(websiteUrl('/city-guide.html', 'admin.kasluxuryhotel.com')).toBe('https://kasluxuryhotel.com/city-guide.html');
    expect(websiteUrl('/', 'localhost')).toBe('http://localhost:3001/');
  });
});
