'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { propertiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  amenityCategoryLabel,
  amenityLabel,
  type AmenityCatalogEntry,
} from '@/lib/domain/roomType';
import { Button, Card, EmptyState, useToast } from '@/ui/primitives';
import { revalidateProperties } from './actions';
import styles from './Property.module.css';
import roomTypeStyles from '@/features/roomType/RoomType.module.css';

/**
 * The hotel's own amenities.
 *
 * <h2>Why this screen exists</h2>
 *
 * `property_amenity` has existed since V4 and doc 58 §3.1 puts amenities on the
 * guest property detail — which the guest page has rendered since Step 16A.31.
 * But nothing wrote them, so a Partner could not answer the question their own
 * hotel page was already asking, and the only way to assign one was an `INSERT`.
 *
 * <h2>Every category is offered here</h2>
 *
 * The room-type form hides `PROPERTY_FACILITY`, because a room may not claim the
 * building's car park. The property is the other side of that rule, and nothing
 * in the catalogue marks an amenity as room-only — so this offers the whole
 * catalogue rather than inventing the symmetric restriction.
 *
 * <h2>Replace, not merge</h2>
 *
 * Saving sends the whole selection, so clearing every box clears the hotel's
 * amenities. That is the room-type contract too, and it is the only way to
 * remove one that was added by mistake.
 */
export function PropertyAmenitiesPanel({
  propertyId,
  assigned,
  catalog,
  catalogError,
}: {
  readonly propertyId: string;
  readonly assigned: readonly string[];
  readonly catalog: readonly AmenityCatalogEntry[];
  readonly catalogError?: string | undefined;
}) {
  const router = useRouter();
  const { show } = useToast();

  const [selected, setSelected] = useState<readonly string[]>(assigned);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => groupByCategory(catalog), [catalog]);

  // A code the property has but the catalogue no longer offers. Kept selected
  // and named: dropping it silently would strip an assignment on the next save.
  const unknownCodes = selected.filter((code) => !catalog.some((a) => a.code === code));

  const dirty =
    selected.length !== assigned.length || selected.some((code) => !assigned.includes(code));

  function toggle(code: string) {
    setSelected((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await propertiesApi.setAmenities(propertyId, selected);
      await revalidateProperties();
      router.refresh();
      show('success', 'Đã lưu tiện nghi khách sạn.');
    } catch (caught) {
      // The console mapping: the backend's own words, which name the offending
      // codes. A friendlier sentence would hide which one is wrong.
      setError(caught instanceof ApiError ? messageFor(caught) : 'Không lưu được.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Tiện nghi khách sạn">
      <p className={styles.pageIntro}>
        Những tiện nghi này hiển thị trên trang khách sạn dành cho khách. Lưu lại sẽ thay thế
        toàn bộ lựa chọn hiện tại.
      </p>

      {catalogError === undefined ? null : (
        <div role="alert" className={styles.formAlertText}>
          {catalogError} Danh sách tiện nghi hiện chưa tải được.
        </div>
      )}

      {error === null ? null : (
        <p className={styles.publishError} role="alert">
          {error}
        </p>
      )}

      {unknownCodes.length === 0 ? null : (
        <p className={roomTypeStyles.amenityError}>
          Mã tiện nghi không có trong danh mục hiện tại: {unknownCodes.join(', ')}
        </p>
      )}

      {catalog.length === 0 ? (
        <EmptyState title="Chưa có danh mục tiện nghi">
          Danh mục tiện nghi do hệ thống quản lý và hiện chưa tải được.
        </EmptyState>
      ) : (
        grouped.map(([category, entries]) => (
          <fieldset key={category} className={roomTypeStyles.amenityGroup}>
            <legend className={roomTypeStyles.amenityLegend}>
              {amenityCategoryLabel(category)}
            </legend>
            <div className={roomTypeStyles.amenityChoices}>
              {entries.map((entry) => (
                <label key={entry.code} className={roomTypeStyles.amenityChoice}>
                  <input
                    type="checkbox"
                    checked={selected.includes(entry.code)}
                    onChange={() => toggle(entry.code)}
                  />
                  <span>{amenityLabel(entry)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))
      )}

      <div className={styles.formActions}>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? 'Đang lưu…' : 'Lưu tiện nghi'}
        </Button>
      </div>
    </Card>
  );
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
