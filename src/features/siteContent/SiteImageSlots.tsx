'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { siteImageSlotsApi } from '@/lib/api/endpoints/siteImageSlots';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';
import styles from './SiteImageSlots.module.css';
import { PageHeader } from '@/ui/primitives';
import { slotGroupLabel } from './groupLabels';

export function SiteImageSlots() {
  const [slots, setSlots] = useState<SiteImageSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { reference: string; enabled: boolean }>>({});

  useEffect(() => {
    let active = true;
    siteImageSlotsApi.adminList().then((rows) => {
      if (active) {
        setSlots(rows);
        setDrafts(Object.fromEntries(rows.map((row) => [row.key, {
          reference: row.currentReference ?? '', enabled: row.enabled,
        }])));
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof ApiError ? reason.message : 'Không tải được danh sách ảnh.');
    });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => [...new Set(slots.map((slot) => slot.group))], [slots]);
  const updateDraft = (key: string, patch: Partial<{ reference: string; enabled: boolean }>) => {
    setDrafts((current) => {
      const previous = current[key] ?? { reference: '', enabled: true };
      return { ...current, [key]: {
        reference: patch.reference ?? previous.reference,
        enabled: patch.enabled ?? previous.enabled,
      } };
    });
  };

  async function save(key: string) {
    const draft = drafts[key];
    if (!draft) return;
    setBusyKey(key);
    setError(null);
    try {
      const saved = await siteImageSlotsApi.update(key, draft.reference.trim() || null, draft.enabled);
      setSlots((current) => current.map((slot) => slot.key === key ? saved : slot));
      setDrafts((current) => ({ ...current, [key]: {
        reference: saved.currentReference ?? '', enabled: saved.enabled,
      } }));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Không lưu được thay đổi.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={`Nội dung website · ${slots.length} vị trí ảnh`}
        title="Quản lý ảnh website"
        description={
          <p>
            Dán đường dẫn HTTPS hoặc đường dẫn ảnh cùng website cho từng vị trí. Để trống sẽ dùng ảnh mặc định của
            website. Ảnh Guidebook dùng cho cả trang cẩm nang và trang câu chuyện.
          </p>
        }
      />
      {error && <p className={styles.message} role="alert">{error}</p>}
      {groups.map((group) => (
        <section className={styles.group} key={group} aria-labelledby={`group-${group}`}>
          <h2 className={styles.groupTitle} id={`group-${group}`}>
            {slotGroupLabel(group)} <span className={styles.key}>({slots.filter((slot) => slot.group === group).length})</span>
          </h2>
          {slots.filter((slot) => slot.group === group).map((slot) => {
            const draft = drafts[slot.key] ?? { reference: '', enabled: slot.enabled };
            return (
              <div className={styles.slot} key={slot.key}>
                <label className={styles.label}>
                  <span>{slot.label}</span><span className={styles.key}>{slot.key}</span>
                  <span className={styles.key}>Fallback: {slot.defaultReference || 'chưa có ảnh mặc định'}</span>
                </label>
                <input className={styles.input} type="url" aria-label={`Đường dẫn ảnh ${slot.label}`}
                  placeholder={slot.defaultReference || 'https://…'} value={draft.reference}
                  onChange={(event) => updateDraft(slot.key, { reference: event.target.value })} />
                <div className={styles.actions}>
                  <label className={styles.toggle}>
                    <input type="checkbox" checked={draft.enabled}
                      onChange={(event) => updateDraft(slot.key, { enabled: event.target.checked })} /> Hiển thị
                  </label>
                  <button className={styles.button} type="button" disabled={busyKey === slot.key}
                    onClick={() => void save(slot.key)}>{busyKey === slot.key ? 'Đang lưu…' : 'Lưu'}</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

