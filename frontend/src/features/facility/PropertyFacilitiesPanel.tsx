'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { facilitiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  FACILITY_TYPES,
  facilityName,
  facilityTypeLabel,
  nextSortOrder,
  type FacilityType,
  type FacilityView,
  type FacilityWriteRequest,
} from '@/lib/domain/facility';
import { Badge, Button, Card, EmptyState, Input, Select, Textarea, useToast } from '@/ui/primitives';
import { revalidateFacilities } from './actions';
import styles from './Facility.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * A property's facility blocks — doc 23 §5, through doc 58 §8's
 * `/admin/properties/{id}/facilities`.
 *
 * <h2>What this authors, and what it does not</h2>
 *
 * Type, per-locale name and description, "open to non-residents", and the order.
 * Doc 23 §5's `images[]`, `openingHours` and `highlights[]` are absent because
 * the first has no API and no bytes (OQ-106), the second is specified only as
 * "structured", and the third has no column. A field that saved nothing would be
 * worse than one that is not there.
 *
 * <h2>The type is chosen once</h2>
 *
 * The editor offers the type only when adding. Doc 23 §5 makes the type what the
 * block *is*, and the backend ignores it on update — a control that appeared to
 * change it and silently did not would be worse than no control.
 *
 * <h2>Withdrawing is not deleting</h2>
 *
 * "Gỡ khỏi trang" archives: the block leaves the guest page and stays visible
 * here, because a Partner needs to see what they withdrew.
 */
export function PropertyFacilitiesPanel({
  propertyId,
  facilities,
}: {
  readonly propertyId: string;
  readonly facilities: readonly FacilityView[];
}) {
  const router = useRouter();
  const { show } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The facility being edited, or `'new'`, or nothing. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function openNew() {
    setDraft(emptyDraft());
    setEditing('new');
    setError(null);
  }

  function openEdit(facility: FacilityView) {
    setDraft({
      type: (facility.type as FacilityType) ?? 'RESTAURANT',
      nameVi: facility.names['vi'] ?? '',
      nameEn: facility.names['en'] ?? '',
      descriptionVi: facility.descriptions['vi'] ?? '',
      descriptionEn: facility.descriptions['en'] ?? '',
      openToNonResidents: facility.openToNonResidents,
      sortOrder: facility.sortOrder,
    });
    setEditing(facility.id);
    setError(null);
  }

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await revalidateFacilities(propertyId);
      router.refresh();
      setEditing(null);
      show('success', done);
    } catch (caught) {
      // The console mapping: the backend's own words, which name the field and
      // the locale. A friendlier sentence would hide both.
      setError(caught instanceof ApiError ? messageFor(caught) : 'Không lưu được.');
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const body = toRequest(draft);
    if (editing === 'new') {
      return run('save', () => facilitiesApi.create(propertyId, {
        ...body,
        sortOrder: nextSortOrder(facilities),
      }), 'Đã thêm tiện ích.');
    }
    const facilityId = editing as string;
    return run('save', () => facilitiesApi.update(propertyId, facilityId, body),
      'Đã lưu tiện ích.');
  }

  const nameGiven = draft.nameVi.trim() !== '' || draft.nameEn.trim() !== '';

  return (
    <Card
      title="Tiện ích khách sạn"
      actions={
        editing === null ? (
          <Button variant="secondary" onClick={openNew}>Thêm tiện ích</Button>
        ) : null
      }
    >
      <p className={propertyStyles.pageIntro}>
        Nhà hàng, quầy bar, sân thượng, hồ bơi… Mỗi tiện ích là một khối nội dung riêng trên
        trang khách sạn dành cho khách, có tên và mô tả theo từng ngôn ngữ.
      </p>

      {error === null ? null : (
        <p className={propertyStyles.publishError} role="alert">{error}</p>
      )}

      {editing === null ? null : (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>
            {editing === 'new' ? 'Tiện ích mới' : 'Sửa tiện ích'}
          </h3>

          <div className={styles.editorGrid}>
            {editing === 'new' ? (
              <Select
                id="facility-type"
                label="Loại tiện ích"
                required
                value={draft.type}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, type: event.target.value as FacilityType }))
                }
                options={FACILITY_TYPES.map((value) => ({
                  value,
                  label: facilityTypeLabel(value),
                }))}
              />
            ) : (
              // Doc 23 §5 makes the type what the block is, and the backend
              // ignores it on update. A control here would appear to change
              // something it cannot.
              <div className={styles.fixedType}>
                <span className={styles.fixedTypeLabel}>Loại tiện ích</span>
                <span className={styles.fixedTypeValue}>{facilityTypeLabel(draft.type)}</span>
              </div>
            )}

            <Select
              id="facility-open"
              label="Đón khách không lưu trú"
              optionalLabel="chưa xác định"
              value={draft.openToNonResidents === null ? '' : String(draft.openToNonResidents)}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  openToNonResidents: event.target.value === '' ? null : event.target.value === 'true',
                }))
              }
              options={[
                { value: '', label: 'Chưa xác định' },
                { value: 'true', label: 'Có' },
                { value: 'false', label: 'Không' },
              ]}
            />
          </div>

          <div className={styles.editorGrid}>
            <Input
              id="facility-name-vi"
              label="Tên (tiếng Việt)"
              value={draft.nameVi}
              maxLength={120}
              onChange={(event) => setDraft((d) => ({ ...d, nameVi: event.target.value }))}
            />
            <Input
              id="facility-name-en"
              label="Tên (tiếng Anh)"
              value={draft.nameEn}
              maxLength={120}
              onChange={(event) => setDraft((d) => ({ ...d, nameEn: event.target.value }))}
            />
          </div>

          <Textarea
            id="facility-description-vi"
            label="Mô tả (tiếng Việt)"
            optionalLabel="không bắt buộc"
            rows={3}
            value={draft.descriptionVi}
            onChange={(event) => setDraft((d) => ({ ...d, descriptionVi: event.target.value }))}
          />
          <Textarea
            id="facility-description-en"
            label="Mô tả (tiếng Anh)"
            optionalLabel="không bắt buộc"
            rows={3}
            value={draft.descriptionEn}
            onChange={(event) => setDraft((d) => ({ ...d, descriptionEn: event.target.value }))}
          />

          <p className={styles.editorHint}>
            Khách chỉ thấy tiện ích ở ngôn ngữ đã có tên. Một tiện ích chưa dịch sẽ không hiện
            ở ngôn ngữ đó, thay vì hiện ra mã loại.
          </p>

          <div className={propertyStyles.formActions}>
            <Button onClick={save} disabled={busy !== null || !nameGiven}>
              {busy === 'save' ? 'Đang lưu…' : 'Lưu tiện ích'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy !== null}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {facilities.length === 0 ? (
        <EmptyState title="Chưa có tiện ích nào">
          Thêm nhà hàng, quầy bar hoặc hồ bơi của khách sạn để khách nhìn thấy trên trang đặt phòng.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {facilities.map((facility) => (
            <li
              key={facility.id}
              className={facility.archived ? styles.itemArchived : styles.item}
            >
              <div className={styles.itemHead}>
                <span className={styles.itemType}>{facilityTypeLabel(facility.type)}</span>
                {facility.archived ? <Badge tone="neutral">Đã gỡ</Badge> : null}
                {facility.openToNonResidents === true ? (
                  <Badge tone="info">Đón khách ngoài</Badge>
                ) : null}
              </div>

              <p className={styles.itemName}>{facilityName(facility) ?? 'Chưa đặt tên'}</p>

              <dl className={styles.itemLocales}>
                {['vi', 'en'].map((locale) => (
                  <div key={locale}>
                    <dt>{locale === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}</dt>
                    <dd>
                      {facility.names[locale] === undefined ? (
                        <span className={styles.missing}>Chưa có tên</span>
                      ) : (
                        facility.names[locale]
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className={styles.itemActions}>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => openEdit(facility)}
                >
                  Sửa
                </Button>
                {facility.archived ? null : (
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `archive-${facility.id}`,
                        () => facilitiesApi.archive(propertyId, facility.id),
                        'Đã gỡ tiện ích khỏi trang khách.',
                      )
                    }
                  >
                    {busy === `archive-${facility.id}` ? 'Đang gỡ…' : 'Gỡ khỏi trang'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface Draft {
  readonly type: FacilityType;
  readonly nameVi: string;
  readonly nameEn: string;
  readonly descriptionVi: string;
  readonly descriptionEn: string;
  readonly openToNonResidents: boolean | null;
  readonly sortOrder: number;
}

function emptyDraft(): Draft {
  return {
    type: 'RESTAURANT',
    nameVi: '',
    nameEn: '',
    descriptionVi: '',
    descriptionEn: '',
    openToNonResidents: null,
    sortOrder: 0,
  };
}

/**
 * Only the locales that actually have a name are sent.
 *
 * A blank field means "not written", and sending it would either be refused by
 * the backend's non-blank check or, worse, overwrite a name the other editor
 * just saved. An empty description is dropped for the same reason: the backend
 * keeps the stored one when a description is absent.
 */
function toRequest(draft: Draft): FacilityWriteRequest {
  const translations: Record<string, { name: string; description?: string }> = {};

  const add = (locale: string, name: string, description: string) => {
    if (name.trim() === '') {
      return;
    }
    translations[locale] = description.trim() === ''
      ? { name: name.trim() }
      : { name: name.trim(), description: description.trim() };
  };

  add('vi', draft.nameVi, draft.descriptionVi);
  add('en', draft.nameEn, draft.descriptionEn);

  return {
    type: draft.type,
    translations,
    openToNonResidents: draft.openToNonResidents,
    sortOrder: draft.sortOrder,
  };
}
