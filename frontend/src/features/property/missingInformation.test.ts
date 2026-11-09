import { describe, expect, it } from 'vitest';
import { missingInformation, type PropertyAdminView } from '@/lib/domain/property';

/** A record with nothing filled in beyond the columns the schema makes NOT NULL. */
function bare(overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'kas-passion-boutique-hotel',
    names: {},
    signatureLines: {},
    shortDescriptions: {},
    amenityCodes: [],
    tripIntentCodes: [],
    lifecycleState: 'DRAFT',
    isFlagship: false,
    city: 'Ho Chi Minh City',
    sortOrder: 1,
    version: 1,
    ...overrides,
  };
}

/** Everything the Information screen can write, written. */
function complete(): PropertyAdminView {
  return bare({
    names: { vi: 'Kas Passion', en: 'Kas Passion' },
    signatureLines: { vi: 'Một câu' },
    shortDescriptions: { vi: 'Mô tả', en: 'Description' },
    ward: 'Bến Nghé',
    district: 'Quận 1',
    latitude: 10.7725,
    longitude: 106.698,
    phone: '+84 28 3823 6688',
    amenityCodes: ['wifi'],
  });
}

describe('missingInformation', () => {
  it('reports nothing when every Information field is written', () => {
    expect(missingInformation(complete())).toEqual([]);
  });

  it('names each blank field rather than returning a bare count', () => {
    const missing = missingInformation(bare());

    // The list is what the table puts in `title`, so an operator can see what is
    // outstanding without opening the property.
    expect(missing).toContain('Câu giới thiệu');
    expect(missing).toContain('Phường/Xã');
    expect(missing).toContain('Quận/Huyện');
    expect(missing).toContain('Toạ độ');
    expect(missing).toContain('Điện thoại');
    expect(missing).toContain('Tiện nghi');
  });

  it('asks for both locales of the name and the short description', () => {
    const missing = missingInformation(bare({ names: { vi: 'Có tên' } }));

    expect(missing).toContain('Tên (English (en))');
    expect(missing).not.toContain('Tên (Tiếng Việt (vi))');
    expect(missing.filter((f) => f.startsWith('Mô tả ngắn'))).toHaveLength(2);
  });

  it('accepts a signature line in either locale, matching the publish invariant', () => {
    // Doc 52 §3.1 requires *a* signature line, not one per locale — unlike the
    // short description, which the same rule requires in both.
    expect(missingInformation(complete())).not.toContain('Câu giới thiệu');
    expect(missingInformation(bare({ signatureLines: { en: 'One line' } }))).not.toContain(
      'Câu giới thiệu',
    );
  });

  it('treats whitespace as unwritten', () => {
    const spaces = complete();
    expect(missingInformation({ ...spaces, phone: '   ' })).toContain('Điện thoại');
  });

  it('judges the coordinate pair together, because half a coordinate is not a location', () => {
    // Built by deletion rather than an explicit `undefined`: under
    // exactOptionalPropertyTypes an absent key and a present undefined are
    // different types, and the API omits the key entirely.
    const without = (key: 'latitude' | 'longitude'): PropertyAdminView => {
      const record: Record<string, unknown> = { ...complete() };
      delete record[key];
      return record as unknown as PropertyAdminView;
    };

    expect(missingInformation(without('longitude'))).toContain('Toạ độ');
    expect(missingInformation(without('latitude'))).toContain('Toạ độ');
  });

  it('never asks for city, which the schema makes NOT NULL', () => {
    expect(missingInformation(bare()).some((f) => /Tỉnh|Thành phố|city/i.test(f))).toBe(false);
  });

  it('reports only Information-screen fields, never the publish gate', () => {
    const missing = missingInformation(bare());

    // Room types, hero media and signature experiences are publish invariants
    // too, and none of them is on this record. `GET /{id}/completeness` is the
    // only thing allowed to answer that question.
    expect(missing.some((f) => /phòng|hình ảnh|trải nghiệm/i.test(f))).toBe(false);
  });
});
