'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives';
import styles from './Media.module.css';

/**
 * What can be done with the photos picked in a gallery: select all, clear, or remove them
 * in one go. Removing asks once, inline, and says how many will actually go — a cover
 * (Hero / main photo) is never removed in bulk, so the gallery always keeps its lead image.
 */
export function SelectionBar({
  total,
  selected,
  removable,
  busy,
  coverLabel,
  onSelectAll,
  onClear,
  onRemove,
}: {
  readonly total: number;
  readonly selected: number;
  /** How many of the selected may be removed (the cover is not). */
  readonly removable: number;
  readonly busy: boolean;
  readonly coverLabel: string;
  readonly onSelectAll: () => void;
  readonly onClear: () => void;
  readonly onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (selected === 0) {
    return (
      <p className={styles.arrangeHint}>
        Kéo thả ảnh để đổi thứ tự. Kéo trên khoảng trống để chọn nhanh nhiều ảnh, hoặc bấm ô vuông trên ảnh (giữ Shift để chọn liền nhau).
      </p>
    );
  }
  const skipped = selected - removable;
  return (
    <div className={styles.selectionBar} role="region" aria-label="Ảnh đã chọn">
      <strong>Đã chọn {selected}/{total} ảnh</strong>
      {confirming ? (
        <>
          <span>
            Gỡ {removable} ảnh khỏi thư viện?{skipped > 0 ? ` ${coverLabel} được giữ lại.` : ''} Ảnh vẫn còn trong kho ảnh.
          </span>
          <Button variant="danger" onClick={() => { setConfirming(false); onRemove(); }} disabled={busy || removable === 0}>
            Gỡ {removable} ảnh
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Không</Button>
        </>
      ) : (
        <>
          {selected < total ? <Button variant="ghost" onClick={onSelectAll} disabled={busy}>Chọn tất cả</Button> : null}
          <Button variant="ghost" onClick={onClear} disabled={busy}>Bỏ chọn</Button>
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy || removable === 0}>
            Gỡ ảnh đã chọn
          </Button>
        </>
      )}
    </div>
  );
}
