'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { landmarksApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  landmarkDistanceLabel,
  landmarkName,
  nextSortOrder,
  type LandmarkView,
  type LandmarkWriteRequest,
} from '@/lib/domain/landmark';
import { Button, Card, EmptyState, Input, Textarea, useToast } from '@/ui/primitives';
import { revalidateLandmarks } from './actions';
import styles from './Landmark.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * A property's nearby landmarks — doc 23 §3.3, written here and read by a guest
 * on the property detail (doc 58 §3.1).
 *
 * <h2>Both measures are optional, and independent</h2>
 *
 * Doc 03 §5.2 asks for <strong>verified</strong> walking distances. So neither
 * field is required, neither is computed from the other, and a landmark with no
 * measurement at all still saves — a named place is worth listing even before
 * someone has walked it with a stopwatch.
 *
 * <h2>Removing is removing</h2>
 *
 * Unlike a facility, a landmark is deleted rather than archived: the table has no
 * `archived_at`, and a landmark is a claim about the neighbourhood rather than a
 * record of what a guest was shown. A wrong claim should stop being made.
 */
export function PropertyLandmarksPanel({
  propertyId,
  landmarks,
}: {
  readonly propertyId: string;
  readonly landmarks: readonly LandmarkView[];
}) {
  const router = useRouter();
  const { show } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The landmark being edited, or `'new'`, or nothing. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function openNew() {
    setDraft(emptyDraft());
    setEditing('new');
    setError(null);
  }

  function openEdit(landmark: LandmarkView) {
    setDraft({
      type: landmark.type ?? '',
      nameVi: landmark.names['vi'] ?? '',
      nameEn: landmark.names['en'] ?? '',
      descriptionVi: landmark.descriptions['vi'] ?? '',
      descriptionEn: landmark.descriptions['en'] ?? '',
      distanceMetres: landmark.distanceMetres === null ? '' : String(landmark.distanceMetres),
      walkingMinutes: landmark.walkingMinutes === null ? '' : String(landmark.walkingMinutes),
      sortOrder: landmark.sortOrder,
    });
    setEditing(landmark.id);
    setError(null);
  }

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await revalidateLandmarks(propertyId);
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
      return run('save', () => landmarksApi.create(propertyId, {
        ...body,
        sortOrder: nextSortOrder(landmarks),
      }), 'Đã thêm địa điểm.');
    }
    const landmarkId = editing as string;
    return run('save', () => landmarksApi.update(propertyId, landmarkId, body),
      'Đã lưu địa điểm.');
  }

  const nameGiven = draft.nameVi.trim() !== '' || draft.nameEn.trim() !== '';

  return (
    <Card
      title="Địa điểm lân cận"
      actions={
        editing === null ? (
          <Button variant="secondary" onClick={openNew}>Thêm địa điểm</Button>
        ) : null
      }
    >
      <p className={propertyStyles.pageIntro}>
        Chợ, công viên, bảo tàng… những nơi gần khách sạn. Khách sẽ thấy khoảng cách đúng như
        khách sạn đã xác minh, nên hãy để trống nếu chưa đo.
      </p>

      {error === null ? null : (
        <p className={propertyStyles.publishError} role="alert">{error}</p>
      )}

      {editing === null ? null : (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>
            {editing === 'new' ? 'Địa điểm mới' : 'Sửa địa điểm'}
          </h3>

          <div className={styles.editorGrid}>
            <Input
              id="landmark-name-vi"
              label="Tên (tiếng Việt)"
              value={draft.nameVi}
              maxLength={160}
              onChange={(event) => setDraft((d) => ({ ...d, nameVi: event.target.value }))}
            />
            <Input
              id="landmark-name-en"
              label="Tên (tiếng Anh)"
              value={draft.nameEn}
              maxLength={160}
              onChange={(event) => setDraft((d) => ({ ...d, nameEn: event.target.value }))}
            />
          </div>

          <div className={styles.editorGrid}>
            <Input
              id="landmark-walking"
              label="Thời gian đi bộ (phút)"
              optionalLabel="để trống nếu chưa đo"
              inputMode="numeric"
              value={draft.walkingMinutes}
              onChange={(event) =>
                setDraft((d) => ({ ...d, walkingMinutes: digitsOnly(event.target.value) }))
              }
            />
            <Input
              id="landmark-distance"
              label="Khoảng cách (mét)"
              optionalLabel="để trống nếu chưa đo"
              inputMode="numeric"
              value={draft.distanceMetres}
              onChange={(event) =>
                setDraft((d) => ({ ...d, distanceMetres: digitsOnly(event.target.value) }))
              }
            />
          </div>

          <Input
            id="landmark-type"
            label="Phân loại"
            optionalLabel="không bắt buộc"
            maxLength={60}
            value={draft.type}
            onChange={(event) => setDraft((d) => ({ ...d, type: event.target.value }))}
          />

          <Textarea
            id="landmark-description-vi"
            label="Mô tả (tiếng Việt)"
            optionalLabel="không bắt buộc"
            rows={2}
            value={draft.descriptionVi}
            onChange={(event) => setDraft((d) => ({ ...d, descriptionVi: event.target.value }))}
          />
          <Textarea
            id="landmark-description-en"
            label="Mô tả (tiếng Anh)"
            optionalLabel="không bắt buộc"
            rows={2}
            value={draft.descriptionEn}
            onChange={(event) => setDraft((d) => ({ ...d, descriptionEn: event.target.value }))}
          />

          <p className={styles.editorHint}>
            Khách chỉ thấy địa điểm ở ngôn ngữ đã có tên. Hai số đo độc lập với nhau — hệ thống
            không tự suy ra thời gian đi bộ từ khoảng cách.
          </p>

          <div className={propertyStyles.formActions}>
            <Button onClick={save} disabled={busy !== null || !nameGiven}>
              {busy === 'save' ? 'Đang lưu…' : 'Lưu địa điểm'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy !== null}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {landmarks.length === 0 ? (
        <EmptyState title="Chưa có địa điểm nào">
          Thêm chợ, công viên hoặc điểm tham quan gần khách sạn để khách hình dung được vị trí.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {landmarks.map((landmark) => (
            <li key={landmark.id} className={styles.item}>
              <div className={styles.itemHead}>
                <p className={styles.itemName}>{landmarkName(landmark) ?? 'Chưa đặt tên'}</p>
                {landmarkDistanceLabel(landmark) === null ? (
                  <span className={styles.unmeasured}>Chưa đo</span>
                ) : (
                  <span className={styles.itemDistance}>{landmarkDistanceLabel(landmark)}</span>
                )}
              </div>

              <dl className={styles.itemLocales}>
                {['vi', 'en'].map((locale) => (
                  <div key={locale}>
                    <dt>{locale === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}</dt>
                    <dd>
                      {landmark.names[locale] === undefined ? (
                        <span className={styles.missing}>Chưa có tên</span>
                      ) : (
                        landmark.names[locale]
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className={styles.itemActions}>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => openEdit(landmark)}
                >
                  Sửa
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      `delete-${landmark.id}`,
                      () => landmarksApi.remove(propertyId, landmark.id),
                      'Đã xoá địa điểm.',
                    )
                  }
                >
                  {busy === `delete-${landmark.id}` ? 'Đang xoá…' : 'Xoá'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface Draft {
  readonly type: string;
  readonly nameVi: string;
  readonly nameEn: string;
  readonly descriptionVi: string;
  readonly descriptionEn: string;
  /** Kept as text so an empty field stays "unmeasured" rather than becoming 0. */
  readonly distanceMetres: string;
  readonly walkingMinutes: string;
  readonly sortOrder: number;
}

function emptyDraft(): Draft {
  return {
    type: '',
    nameVi: '',
    nameEn: '',
    descriptionVi: '',
    descriptionEn: '',
    distanceMetres: '',
    walkingMinutes: '',
    sortOrder: 0,
  };
}

/** Digits only, so a negative or a stray letter never reaches the backend. */
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Only the locales that actually have a name are sent, and an empty measurement
 * is sent as `null` rather than `0`.
 *
 * "Not measured" and "zero metres away" are different claims, and doc 03 §5.2
 * asks for verified distances — so a blank field must not become a number.
 */
function toRequest(draft: Draft): LandmarkWriteRequest {
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
    type: draft.type.trim() === '' ? null : draft.type.trim(),
    translations,
    distanceMetres: draft.distanceMetres === '' ? null : Number(draft.distanceMetres),
    walkingMinutes: draft.walkingMinutes === '' ? null : Number(draft.walkingMinutes),
    sortOrder: draft.sortOrder,
  };
}
