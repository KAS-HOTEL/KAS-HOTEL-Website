'use client';

import { useState, type FormEvent } from 'react';
import { propertiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { PublicTripIntent } from '@/lib/domain/availability';
import { Button } from '@/ui/primitives';
import { revalidateProperties } from './actions';
import styles from './TripIntentEditor.module.css';

export function TripIntentEditor({
  propertyId,
  initialCodes,
  intents,
}: {
  readonly propertyId: string;
  readonly initialCodes: readonly string[];
  readonly intents: readonly PublicTripIntent[];
}) {
  const [selected, setSelected] = useState<readonly string[]>(initialCodes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(code: string) {
    setSelected((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code]);
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await propertiesApi.setTripIntents(propertyId, selected);
      setSelected(result.tripIntentCodes);
      setSaved(true);
      await revalidateProperties();
    } catch (caught) {
      setError(caught instanceof ApiError
        ? 'Không lưu được nhóm trải nghiệm. Hãy tải lại trang và thử lại.'
        : 'Không thể kết nối tới hệ thống. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="trip-intent-editor-title">
      <h2 className={styles.title} id="trip-intent-editor-title">Nhóm Find Your KAS</h2>
      <p className={styles.note}>
        Chọn tất cả nhóm phù hợp. Một khách sạn có thể xuất hiện trong nhiều nhóm; thay đổi sẽ cập nhật trên trang khách hàng.
      </p>
      <form onSubmit={submit}>
        <div className={styles.options}>
          {intents.map((intent) => (
            <label className={styles.option} key={intent.code}>
              <input
                type="checkbox"
                checked={selected.includes(intent.code)}
                onChange={() => toggle(intent.code)}
              />
              <span className={styles.optionText}>
                <span className={styles.label}>{intent.label}</span>
                <span className={styles.description}>{intent.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          <Button type="submit" disabled={saving || intents.length === 0}>
            {saving ? 'Đang lưu…' : 'Lưu nhóm trải nghiệm'}
          </Button>
          {saved ? <p className={styles.status} role="status">Đã lưu nhóm trải nghiệm.</p> : null}
          {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
        </div>
      </form>
    </section>
  );
}
