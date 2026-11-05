'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '@/features/auth/messages';
import { roomTypesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  amenityCategoryLabel,
  amenityLabel,
  PROPERTY_ONLY_AMENITY_CATEGORY,
  roomTypeStatusLabel,
  VIEW_TYPE_LABELS,
  type AmenityCatalogEntry,
  type BedConfigurationInput,
  type RoomTypeView,
  type RoomTypeWriteRequest,
} from '@/lib/domain/roomType';
import { Badge, Button, EmptyState, Input, Select, useToast } from '@/ui/primitives';
import { FormSection } from '@/features/property/FormSection';
import { revalidateRoomTypes } from './actions';
import styles from './RoomType.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * Creating and editing a room type.
 *
 * One component for both, because the backend takes one `RoomTypeRequest` for
 * both — two forms would be two places for the same shape to drift.
 *
 * <h2>The version</h2>
 *
 * Loaded with the room type, held in state, sent as a **query parameter** on
 * every save (this contract differs from the property one — OQ-139), and
 * replaced from each response. A stale one comes back 409 and the Partner is
 * offered a reload, because that is the one error retyping cannot fix.
 *
 * <h2>No publish control, by construction</h2>
 *
 * `RoomTypeStatus.isPartnerPermittedTransition` refuses `PUBLISHED` for a Partner
 * outright, and `PATCH /{id}/status` is not even wrapped in `lib/api`. Status is
 * rendered read-only with an explanation; there is no control here that the
 * backend would answer 409 to.
 */

interface BedRow {
  readonly key: number;
  readonly bedType: string;
  readonly bedCount: string;
  readonly isDefault: boolean;
}

interface Draft {
  readonly slug: string;
  readonly nameVi: string;
  readonly nameEn: string;
  readonly shortVi: string;
  readonly shortEn: string;
  readonly areaSqm: string;
  readonly maxAdults: string;
  readonly maxChildren: string;
  readonly maxOccupancy: string;
  readonly viewType: string;
  readonly smoking: string;
  readonly beds: readonly BedRow[];
  readonly amenityCodes: readonly string[];
}

export function RoomTypeForm({
  propertyId,
  roomType,
  amenities,
  amenityError,
}: {
  readonly propertyId: string;
  /** Absent when creating. */
  readonly roomType?: RoomTypeView;
  readonly amenities: readonly AmenityCatalogEntry[];
  readonly amenityError?: string | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = roomType !== undefined;

  const [draft, setDraft] = useState<Draft>(() => toDraft(roomType));
  const [version, setVersion] = useState<number>(roomType?.version ?? 0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  // Adopt a newer server record when one arrives.
  //
  // `useState` initialisers do not re-run for a prop change, so without this the
  // form keeps the `version` it first mounted with no matter what the server
  // later says. That breaks the one recovery this form offers: the conflict
  // alert tells the Partner to reload and try again, "Tải lại thông tin mới
  // nhất" calls `router.refresh()`, the Server Component re-renders with the
  // current record — and the form went on holding the stale version, so the
  // retry failed with the very same conflict. The only way out was a full
  // browser reload, which the page never mentions.
  //
  // The stamp carries the id as well as the version, because two different room
  // types can sit at the same version: keying on the number alone would let a
  // route change from one room to another leave the previous room's draft on
  // screen.
  //
  // `null` while creating, and it never changes, so a new room type's draft is
  // never wiped out from under the Partner mid-entry.
  //
  // Written during render rather than in an effect: React's documented way to
  // adjust state on a prop change, and it re-renders before the browser paints,
  // so no stale frame is ever shown.
  const serverStamp = roomType === undefined ? null : `${roomType.id}@${roomType.version}`;
  const [loadedStamp, setLoadedStamp] = useState<string | null>(serverStamp);
  if (serverStamp !== loadedStamp) {
    setLoadedStamp(serverStamp);
    setVersion(roomType?.version ?? 0);
    setDraft(toDraft(roomType));
    setConflict(false);
    setFormError(null);
    setFieldErrors({});
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const text = (key: keyof Draft) => (event: { target: { value: string } }) =>
    set(key, event.target.value as Draft[typeof key]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setConflict(false);

    const local = localProblems(draft);
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }
    setFieldErrors({});

    const body = requestFrom(draft);
    setSaving(true);
    try {
      const saved = editing
        ? await roomTypesApi.update(propertyId, roomType.id, version, body)
        : await roomTypesApi.create(propertyId, body);

      setVersion(saved.version);
      await revalidateRoomTypes(propertyId);
      toast.show('success', editing ? 'Đã lưu loại phòng.' : 'Đã tạo loại phòng.');

      // The id comes from the response, never from anything the form guessed.
      router.push(`/partner/properties/${propertyId}/rooms/${saved.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(mapFieldErrors(caught));
        setFormError(messageFor(caught));
        setConflict(caught.isConflict);
      } else {
        setFormError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      }
    } finally {
      setSaving(false);
    }
  }

  const selectable = amenities.filter((a) => a.category !== PROPERTY_ONLY_AMENITY_CATEGORY);
  const grouped = groupByCategory(selectable);
  // A code the room already has but the catalogue no longer offers. Kept visible
  // and kept selected: dropping it would silently strip an assignment on save.
  const unknownCodes = draft.amenityCodes.filter(
    (code) => !selectable.some((a) => a.code === code),
  );

  return (
    <form className={propertyStyles.form} onSubmit={onSubmit} noValidate>
      {formError === null ? null : (
        <div className={propertyStyles.formAlert} role="alert">
          <p className={propertyStyles.formAlertText}>{formError}</p>
          {conflict ? (
            <Button variant="secondary" onClick={() => router.refresh()}>
              Tải lại thông tin mới nhất
            </Button>
          ) : null}
        </div>
      )}

      <FormSection title="Thông tin phòng">
        <div className={propertyStyles.formGrid}>
          <Input
            id="slug"
            label="Định danh (slug)"
            value={draft.slug}
            onChange={text('slug')}
            error={fieldErrors['slug']}
            description="Chữ thường, số và dấu gạch ngang."
            required
            maxLength={120}
            readOnly={editing}
          />
          <Input
            id="name-vi"
            label="Tên tiếng Việt"
            value={draft.nameVi}
            onChange={text('nameVi')}
            error={fieldErrors['nameVi']}
            maxLength={200}
          />
          <Input
            id="name-en"
            label="Tên tiếng Anh"
            value={draft.nameEn}
            onChange={text('nameEn')}
            error={fieldErrors['nameEn']}
            maxLength={200}
          />
          <Input
            id="short-vi"
            label="Mô tả ngắn (VI)"
            value={draft.shortVi}
            onChange={text('shortVi')}
            error={fieldErrors['shortVi']}
            maxLength={2000}
          />
          <Input
            id="short-en"
            label="Mô tả ngắn (EN)"
            value={draft.shortEn}
            onChange={text('shortEn')}
            error={fieldErrors['shortEn']}
            maxLength={2000}
          />
        </div>
        <p className={styles.publishNote}>
          Cần tên ở cả hai ngôn ngữ trước khi khách sạn có thể gửi duyệt. Bỏ trống một ngôn ngữ
          nghĩa là giữ nguyên giá trị đã lưu, không phải xoá.
        </p>
      </FormSection>

      <FormSection title="Sức chứa & đặc điểm" note="Sức chứa quyết định phòng có hiện với đoàn khách của khách hàng hay không.">
        <div className={propertyStyles.formGrid}>
          <Input
            id="max-adults"
            label="Người lớn"
            type="number"
            min={1}
            value={draft.maxAdults}
            onChange={text('maxAdults')}
            error={fieldErrors['maxAdults']}
            required
          />
          <Input
            id="max-children"
            label="Trẻ em"
            type="number"
            min={0}
            value={draft.maxChildren}
            onChange={text('maxChildren')}
            error={fieldErrors['maxChildren']}
            required
          />
          <Input
            id="max-occupancy"
            label="Sức chứa tối đa"
            type="number"
            min={1}
            value={draft.maxOccupancy}
            onChange={text('maxOccupancy')}
            error={fieldErrors['maxOccupancy']}
            description="Không vượt quá tổng người lớn và trẻ em."
            required
          />
        </div>

        {/*
          Was a separate "Phòng" card. Occupancy, size, view and smoking are the
          same question asked four ways — what kind of room is this — and an
          operator filling one in is already thinking about the others.
        */}
        <div className={propertyStyles.formGrid}>
          <Input
            id="area-sqm"
            label="Diện tích (m²)"
            type="number"
            min={0}
            step="0.1"
            value={draft.areaSqm}
            onChange={text('areaSqm')}
            error={fieldErrors['areaSqm']}
          />
          <Select
            id="view-type"
            label="Hướng nhìn"
            value={draft.viewType}
            onChange={text('viewType')}
            error={fieldErrors['viewType']}
            placeholder="Chưa đặt"
            // The five frozen view_type values. Doc 94 records that the enum was
            // deliberately not extended, so the picker offers exactly these.
            options={Object.entries(VIEW_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            id="smoking"
            label="Hút thuốc"
            value={draft.smoking}
            onChange={text('smoking')}
            options={[
              { value: 'false', label: 'Không được phép' },
              { value: 'true', label: 'Được phép' },
            ]}
          />
        </div>
      </FormSection>

      <FormSection
        title="Giường"
        actions={
          <Button variant="secondary" onClick={() => set('beds', [...draft.beds, emptyBed()])}>
            Thêm giường
          </Button>
        }
      >
        {draft.beds.length === 0 ? (
          <EmptyState title="Chưa có cấu hình giường">
            Thêm ít nhất một cấu hình để khách biết phòng có giường gì.
          </EmptyState>
        ) : (
          <ul className={styles.bedList}>
            {draft.beds.map((bed, index) => (
              <li key={bed.key} className={styles.bedRow}>
                <Input
                  id={`bed-type-${bed.key}`}
                  label="Loại giường"
                  value={bed.bedType}
                  onChange={(event) => updateBed(setDraft, bed.key, { bedType: event.target.value })}
                  error={index === 0 ? fieldErrors['beds'] : undefined}
                  // Free text on purpose: the column has only a non-blank CHECK
                  // and there is no bed catalogue anywhere in the frozen schema
                  // (OQ-102). A dropdown here would invent a vocabulary.
                  description="Ví dụ: King, Queen, Twin, Sofa."
                  maxLength={80}
                />
                <Input
                  id={`bed-count-${bed.key}`}
                  label="Số lượng"
                  type="number"
                  min={1}
                  value={bed.bedCount}
                  onChange={(event) =>
                    updateBed(setDraft, bed.key, { bedCount: event.target.value })
                  }
                />
                <div className={styles.bedActions}>
                  <Button
                    variant={bed.isDefault ? 'primary' : 'ghost'}
                    onClick={() => setDefaultBed(setDraft, bed.key)}
                    aria-pressed={bed.isDefault}
                  >
                    Mặc định
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        beds: current.beds.filter((b) => b.key !== bed.key),
                      }))
                    }
                    aria-label={`Xoá cấu hình giường ${index + 1}`}
                  >
                    Xoá
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="Tiện nghi">
        {amenityError !== undefined ? (
          <div role="alert" className={propertyStyles.formAlertText}>
            {amenityError} Bạn vẫn có thể lưu các thay đổi khác; danh sách tiện nghi sẽ giữ nguyên.
          </div>
        ) : null}

        {fieldErrors['amenityCodes'] === undefined ? null : (
          <p className={styles.amenityError} role="alert">
            {fieldErrors['amenityCodes']}
          </p>
        )}

        {unknownCodes.length === 0 ? null : (
          // Never silently dropped: an unrecognised code stays selected and
          // visible so the Partner decides, and the backend still validates it.
          <p className={styles.amenityError}>
            Mã tiện nghi không có trong danh mục hiện tại: {unknownCodes.join(', ')}
          </p>
        )}

        {grouped.length === 0 ? (
          <EmptyState title="Không tải được danh mục tiện nghi">
            Danh mục tiện nghi do hệ thống quản lý và hiện chưa tải được.
          </EmptyState>
        ) : (
          grouped.map(([category, entries]) => (
            <fieldset key={category} className={styles.amenityGroup}>
              <legend className={styles.amenityLegend}>{amenityCategoryLabel(category)}</legend>
              <div className={styles.amenityChoices}>
                {entries.map((entry) => (
                  <label key={entry.code} className={styles.amenityChoice}>
                    <input
                      type="checkbox"
                      checked={draft.amenityCodes.includes(entry.code)}
                      onChange={() => toggleAmenity(setDraft, entry.code)}
                    />
                    <span>{amenityLabel(entry)}</span>
                    {entry.isHighlight ? <Badge tone="info">Nổi bật</Badge> : null}
                  </label>
                ))}
              </div>
            </fieldset>
          ))
        )}
      </FormSection>

      {/*
        Photographs are not fields on this form — they are uploads, with their
        own ordering and cover flag, on their own screen. Pointing at it from
        here is what stops a Partner filling in a room and never learning it can
        carry a gallery. Only when editing: a room that does not exist yet has
        nothing to attach an image to.
      */}
      {roomType === undefined ? null : (
        <FormSection
          title="Hình ảnh"
          actions={
            <Link
              className={propertyStyles.sectionLink}
              href={`/partner/properties/${propertyId}/rooms/${roomType.id}/media`}
            >
              Quản lý ảnh phòng
            </Link>
          }
        >
          <p className={styles.publishNote}>
            Mỗi loại phòng có thư viện ảnh riêng — giường, phòng tắm, ban công, tầm nhìn. Khách chỉ
            thấy ảnh của chính loại phòng đó.
          </p>
        </FormSection>
      )}

      {roomType === undefined ? null : (
        <FormSection title="Trạng thái">
          <dl className={propertyStyles.definitions}>
            <div className={propertyStyles.definition}>
              <dt>Trạng thái hiện tại</dt>
              <dd>{roomTypeStatusLabel(roomType.status)}</dd>
            </div>
          </dl>
          <p className={styles.publishNote}>
            Trạng thái chỉ để xem. Đối tác không thể tự đăng loại phòng lên trang công khai — việc
            hiển thị công khai chỉ diễn ra khi khách sạn được duyệt.
          </p>
        </FormSection>
      )}

      <div className={propertyStyles.formActions}>
        <Button type="submit" loading={saving}>
          {editing ? 'Lưu thay đổi' : 'Tạo loại phòng'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- draft helpers

let nextBedKey = 0;

function emptyBed(): BedRow {
  return { key: (nextBedKey += 1), bedType: '', bedCount: '1', isDefault: false };
}

function toDraft(roomType?: RoomTypeView): Draft {
  return {
    slug: roomType?.slug ?? '',
    nameVi: roomType?.translations['vi']?.name ?? '',
    nameEn: roomType?.translations['en']?.name ?? '',
    shortVi: roomType?.translations['vi']?.shortDescription ?? '',
    shortEn: roomType?.translations['en']?.shortDescription ?? '',
    areaSqm: roomType?.areaSqm === undefined ? '' : String(roomType.areaSqm),
    maxAdults: String(roomType?.maxAdults ?? 2),
    maxChildren: String(roomType?.maxChildren ?? 0),
    maxOccupancy: String(roomType?.maxOccupancy ?? 2),
    viewType: roomType?.viewType ?? '',
    smoking: String(roomType?.smoking ?? false),
    // No `sortOrder` on the draft row: `BedRow` does not declare one, nothing
    // reads it, and carrying it here is what made it look like the write payload
    // needed one too. Order is this array's order, on the way in and out.
    beds: (roomType?.beds ?? []).map((bed) => ({
      key: (nextBedKey += 1),
      bedType: bed.bedType,
      bedCount: String(bed.bedCount),
      isDefault: bed.isDefault,
    })),
    amenityCodes: roomType?.amenityCodes ?? [],
  };
}

function updateBed(
  setDraft: (fn: (current: Draft) => Draft) => void,
  key: number,
  patch: Partial<Pick<BedRow, 'bedType' | 'bedCount'>>,
): void {
  setDraft((current) => ({
    ...current,
    beds: current.beds.map((bed) => (bed.key === key ? { ...bed, ...patch } : bed)),
  }));
}

/** Exactly one default, because `isDefault` marks the configuration shown first. */
function setDefaultBed(setDraft: (fn: (current: Draft) => Draft) => void, key: number): void {
  setDraft((current) => ({
    ...current,
    beds: current.beds.map((bed) => ({ ...bed, isDefault: bed.key === key })),
  }));
}

function toggleAmenity(setDraft: (fn: (current: Draft) => Draft) => void, code: string): void {
  setDraft((current) => ({
    ...current,
    amenityCodes: current.amenityCodes.includes(code)
      ? current.amenityCodes.filter((c) => c !== code)
      : [...current.amenityCodes, code],
  }));
}

function groupByCategory(
  entries: readonly AmenityCatalogEntry[],
): readonly (readonly [string, readonly AmenityCatalogEntry[]])[] {
  const groups = new Map<string, AmenityCatalogEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.category) ?? [];
    bucket.push(entry);
    groups.set(entry.category, bucket);
  }
  return [...groups.entries()];
}

/**
 * What the form can refuse before asking the server.
 *
 * Only the checks that would otherwise produce a confusing round trip. Everything
 * else — occupancy fit, the view-type enum, unknown amenities — is the backend's
 * to enforce, and its field-level errors are rendered where they belong.
 */
export function localProblems(draft: Draft): Record<string, string> {
  const problems: Record<string, string> = {};

  if (draft.slug.trim() === '') {
    problems['slug'] = 'Bắt buộc.';
  } else if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.slug.trim())) {
    problems['slug'] = 'Chỉ gồm chữ thường, số và dấu gạch ngang.';
  }

  // room_type_translation.name is NOT NULL, so at least one locale is required.
  if (draft.nameVi.trim() === '' && draft.nameEn.trim() === '') {
    problems['nameVi'] = 'Cần tên ở ít nhất một ngôn ngữ.';
  }

  if (draft.beds.some((bed) => bed.bedType.trim() === '')) {
    problems['beds'] = 'Mỗi dòng giường cần một loại giường.';
  }

  return problems;
}

/** The request body, built from what the Partner actually filled in. */
export function requestFrom(draft: Draft): RoomTypeWriteRequest {
  const translations: Record<string, { name: string; shortDescription?: string }> = {};
  if (draft.nameVi.trim() !== '') {
    translations['vi'] = {
      name: draft.nameVi.trim(),
      ...(draft.shortVi.trim() === '' ? {} : { shortDescription: draft.shortVi.trim() }),
    };
  }
  if (draft.nameEn.trim() !== '') {
    translations['en'] = {
      name: draft.nameEn.trim(),
      ...(draft.shortEn.trim() === '' ? {} : { shortDescription: draft.shortEn.trim() }),
    };
  }

  // No `sortOrder`: the write contract's bed row has three components and the
  // server derives the order from this array's own order. Sending a fourth key
  // made Jackson reject the entire body — `fail-on-unknown-properties` is on —
  // so every create and every edit returned 400 before this was corrected.
  const beds: BedConfigurationInput[] = draft.beds.map((bed) => ({
    bedType: bed.bedType.trim(),
    bedCount: Number(bed.bedCount) || 1,
    isDefault: bed.isDefault,
  }));

  return {
    slug: draft.slug.trim(),
    translations,
    ...(draft.areaSqm.trim() === '' ? {} : { areaSqm: Number(draft.areaSqm) }),
    maxAdults: Number(draft.maxAdults) || 1,
    maxChildren: Number(draft.maxChildren) || 0,
    maxOccupancy: Number(draft.maxOccupancy) || 1,
    ...(draft.viewType === '' ? {} : { viewType: draft.viewType }),
    smoking: draft.smoking === 'true',
    beds,
    amenityCodes: draft.amenityCodes,
  };
}

/**
 * Backend field paths mapped onto the inputs that own them.
 *
 * Bean validation reports a map entry as `translations[vi].name` and the service
 * reports an unsupported locale as `translations.fr`; both are folded onto the
 * input the Partner can act on. `amenityCodes` stays as itself — the amenity
 * section renders it whole, because the message names which code was refused.
 */
export function mapFieldErrors(error: ApiError): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, message] of Object.entries(error.fieldErrors())) {
    if (field.startsWith('translations')) {
      const locale = field.match(/translations[.[]([a-z]{2})/i)?.[1];
      mapped[locale === 'en' ? 'nameEn' : 'nameVi'] = message;
      continue;
    }
    if (field.startsWith('beds')) {
      mapped['beds'] = message;
      continue;
    }
    mapped[field] = message;
  }
  return mapped;
}
