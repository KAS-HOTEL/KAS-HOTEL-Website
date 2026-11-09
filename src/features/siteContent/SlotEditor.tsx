'use client';

/* eslint-disable @next/next/no-img-element -- slot images may live on owner-approved external hosts. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { siteImageSlotsApi } from '@/lib/api/endpoints/siteImageSlots';
import { StorageUploadError } from '@/lib/api/endpoints/media';
import { ApiError } from '@/lib/api/errors';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';
import { Button, Dialog } from '@/ui/primitives';
import { adminError } from '@/features/adminTools/useAdminList';
import { isSupportedImage, storageMessage, uploadWebsiteImage } from '@/features/media/upload';
import { GUIDE_CHAPTER_LABEL, isAcceptedReference, SLOT_STATE_LABEL, slotPreview, slotState, type CatalogueSlot } from './catalogue';
import styles from './SiteImages.module.css';

/**
 * Replaces one website image: upload a file to the KAS image store or paste an address,
 * compare it with the image shown today, and save. Nothing reaches the website until Save.
 */
export function SlotEditor({
  open,
  where,
  entry,
  slot,
  websiteBase,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly where: string;
  readonly entry: CatalogueSlot | null;
  readonly slot: SiteImageSlot | undefined;
  /** Where same-site image paths are previewed from (the website, not the console host). */
  readonly websiteBase?: string;
  readonly onClose: () => void;
  readonly onSaved: (saved: SiteImageSlot, message: string) => void;
}) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  // Fresh state per opening: the parent remounts the editor (its `key`) each time.
  const [enabled, setEnabled] = useState(slot?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);

  if (!entry) return null;
  const urlValid = url.trim() !== '' && isAcceptedReference(url);
  const next = tab === 'upload' ? filePreview : urlValid ? url.trim() : null;
  const current = slotPreview(slot, websiteBase);
  const state = slotState(slot);
  const changed = next !== null || (slot !== undefined && enabled !== slot.enabled);

  function choose(picked: File | undefined) {
    setDragging(false);
    if (!picked) return;
    if (!isSupportedImage(picked.type)) {
      setError('Định dạng ảnh không được hỗ trợ. Hãy dùng JPEG, PNG, WebP hoặc AVIF.');
      return;
    }
    setError('');
    setFile(picked);
  }

  async function save(reference: string | null | undefined, message: string) {
    if (!entry) return;
    setBusy(true);
    setError('');
    try {
      let target = reference === undefined ? (slot?.currentReference ?? null) : reference;
      if (reference === undefined && tab === 'upload' && file) target = await uploadWebsiteImage(file);
      if (reference === undefined && tab === 'url' && urlValid) target = url.trim();
      const saved = await siteImageSlotsApi.update(entry.key, target, enabled);
      onSaved(saved, message);
    } catch (caught) {
      // Storage, the KAS API and our own checks fail differently and need different fixes.
      setError(caught instanceof StorageUploadError ? storageMessage(caught)
        : caught instanceof ApiError ? adminError(caught)
          : caught instanceof Error ? caught.message
            : adminError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={entry.label}
      variant="drawer"
      side="right"
      footer={(
        <div className={styles.drawerFoot}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button onClick={() => void save(undefined, `Đã lưu “${entry.label}”.`)} disabled={busy || !changed || !slot} loading={busy}>
            Lưu
          </Button>
        </div>
      )}
    >
      <div className={styles.drawerBody}>
        <p className={styles.where}>{where}{entry.order ? ` · vị trí ${String(entry.order).padStart(2, '0')}` : ''}</p>
        {!slot ? (
          <p role="alert" className={styles.error}>Vị trí ảnh này chưa có trong hệ thống. Hãy cập nhật database (migration) rồi tải lại trang.</p>
        ) : null}
        <div className={styles.compare}>
          <figure>
            <div className={styles.preview}>{current ? <img src={current} alt="" referrerPolicy="no-referrer" /> : <span>Chưa có ảnh</span>}</div>
            <figcaption>Đang hiển thị · {SLOT_STATE_LABEL[state]}</figcaption>
          </figure>
          <figure>
            <div className={styles.preview}>{next ? <img src={next} alt="" referrerPolicy="no-referrer" /> : <span>Chọn ảnh mới</span>}</div>
            <figcaption>Ảnh mới (chưa lưu)</figcaption>
          </figure>
        </div>

        <div className={styles.segment} role="tablist" aria-label="Nguồn ảnh">
          <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}>Tải ảnh lên</button>
          <button type="button" role="tab" aria-selected={tab === 'url'} onClick={() => setTab('url')}>Dán đường dẫn</button>
        </div>

        {tab === 'upload' ? (
          <div
            className={styles.drop}
            data-dragging={dragging || undefined}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}
          >
            <input ref={fileInput} id={`slot-file-${entry.key}`} className={styles.fileInput} type="file"
              accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Chọn tệp ảnh"
              onChange={(event) => choose(event.target.files?.[0])} />
            <label htmlFor={`slot-file-${entry.key}`}>{file ? file.name : 'Kéo thả ảnh vào đây hoặc chọn tệp'}</label>
            <span className={styles.hint}>JPEG, PNG, WebP, AVIF. Ảnh được lưu vào kho ảnh KAS.</span>
          </div>
        ) : (
          <label className={styles.field}>
            Đường dẫn ảnh (HTTPS)
            <input type="url" value={url} placeholder="https://…" onChange={(event) => setUrl(event.target.value)} />
            <span className={styles.hint}>Chỉ nhận đường dẫn https:// hoặc đường dẫn trong website (bắt đầu bằng /).</span>
            {url.trim() !== '' && !urlValid ? <span className={styles.error}>Đường dẫn phải bắt đầu bằng https:// hoặc /.</span> : null}
          </label>
        )}

        {entry.chapters && entry.chapters.length > 1 ? (
          <p className={styles.hint}>Ảnh này hiện ở {entry.chapters.length} chương: {entry.chapters.map((c) => GUIDE_CHAPTER_LABEL[c]).join(', ')}.</p>
        ) : null}

        <div className={styles.options}>
          <label className={styles.option}>
            <span><strong>Hiển thị trên website</strong><small>Tắt để ẩn ảnh này và dùng ảnh mặc định.</small></span>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          </label>
          <div className={styles.option}>
            <span><strong>Ảnh mặc định</strong><small>{slot?.defaultReference ? 'Website có ảnh mặc định cho vị trí này.' : 'Không có ảnh mặc định; để trống sẽ hiện ảnh dự phòng của trang.'}</small></span>
            <Button variant="secondary" disabled={busy || !slot?.currentReference}
              onClick={() => void save(null, `Đã chuyển “${entry.label}” về ảnh mặc định.`)}>Dùng ảnh mặc định</Button>
          </div>
        </div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </div>
    </Dialog>
  );
}
