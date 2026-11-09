'use client';

/* eslint-disable @next/next/no-img-element -- slot images may live on owner-approved external hosts. */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { siteImageSlotsApi } from '@/lib/api/endpoints/siteImageSlots';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';
import { PageHeader, useToast } from '@/ui/primitives';
import { adminError, useAdminList } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import {
  contentPage,
  GUIDE_CHAPTER_LABEL,
  SLOT_STATE_LABEL,
  slotPreview,
  slotState,
  type CatalogueBlock,
  type CatalogueSlot,
  type ContentPage,
  type GuideChapter,
} from './catalogue';
import { SlotEditor } from './SlotEditor';
import { websiteUrl } from './websiteUrl';
import styles from './SiteImages.module.css';

/**
 * One "Nội dung website" screen (Trang chủ, Ảnh Hero các trang, Guidebook): the page's image
 * slots in website order, each a card with its image and state; a card opens the editor.
 */
export function SiteImagePage({ page }: { readonly page: ContentPage }) {
  const config = contentPage(page);
  const loader = useCallback(() => siteImageSlotsApi.adminList(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [saved, setSaved] = useState<Readonly<Record<string, SiteImageSlot>>>({});
  const [editing, setEditing] = useState<{ entry: CatalogueSlot; block: CatalogueBlock } | null>(null);
  const [chapter, setChapter] = useState<GuideChapter | 'all'>('all');
  const { show } = useToast();
  // The host is known only in the browser; the server renders the production address.
  const hostname = useSyncExternalStore(noSubscribe, () => window.location.hostname, () => undefined);
  const siteHref = websiteUrl(config.websitePath, hostname);
  // Same-site image paths are previewed from the website, not from the console host.
  const websiteBase = websiteUrl('/', hostname);
  // Each opening gets a fresh editor, so nothing from the last image carries over.
  const [opened, setOpened] = useState(0);

  const byKey = useMemo(() => {
    const map = new Map<string, SiteImageSlot>(rows.map((row) => [row.key, row]));
    Object.values(saved).forEach((row) => map.set(row.key, row));
    return map;
  }, [rows, saved]);

  // Ảnh Zero: drag one onto another to swap their images (each slot keeps its own position).
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  async function swap(fromKey: string, toKey: string) {
    const a = byKey.get(fromKey), b = byKey.get(toKey);
    setDragKey(null); setOverKey(null);
    if (!a || !b) return;
    try {
      const [savedA, savedB] = await Promise.all([
        siteImageSlotsApi.update(a.key, b.currentReference, a.enabled),
        siteImageSlotsApi.update(b.key, a.currentReference, b.enabled),
      ]);
      setSaved((current) => ({ ...current, [savedA.key]: savedA, [savedB.key]: savedB }));
      show('success', 'Đã đổi chỗ hai ảnh.');
    } catch (caught) {
      show('error', adminError(caught));
      void reload();
    }
  }

  const all = config.blocks.flatMap((block) => block.slots);
  const missing = all.filter((entry) => slotState(byKey.get(entry.key)) === 'missing').length;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Nội dung website"
        title={config.title}
        description={config.description}
        actions={<a className={styles.siteLink} href={siteHref} target="_blank" rel="noopener noreferrer">Xem trên website ↗</a>}
      />
      {loading || error ? (
        <ListState loading={loading} error={error} onRetry={() => void reload()}
          errorTitle="Chưa tải được ảnh website" emptyTitle="" emptyDescription="" />
      ) : (
        <>
          <p className={styles.summary}>
            {all.length} vị trí ảnh{missing ? <> · <span className={styles.warnText}>{missing} chưa có ảnh</span></> : ' · đủ ảnh'}
          </p>
          {config.blocks.map((block) => {
            const chapters = block.slots.some((entry) => entry.chapters);
            const shown = chapters && chapter !== 'all'
              ? block.slots.filter((entry) => entry.chapters?.includes(chapter))
              : block.slots;
            return (
              <section key={block.id} className={styles.block} aria-labelledby={`block-${block.id}`}>
                <div className={styles.blockHead}>
                  <h2 id={`block-${block.id}`}>{block.title}</h2>
                  <p>{block.description}</p>
                </div>
                {chapters ? (
                  <div className={styles.chips} role="group" aria-label="Lọc theo chương">
                    <button type="button" aria-pressed={chapter === 'all'} onClick={() => setChapter('all')}>
                      Tất cả <b>{block.slots.length}</b>
                    </button>
                    {(Object.keys(GUIDE_CHAPTER_LABEL) as GuideChapter[]).map((c) => (
                      <button key={c} type="button" aria-pressed={chapter === c} onClick={() => setChapter(c)}>
                        {GUIDE_CHAPTER_LABEL[c]} <b>{block.slots.filter((entry) => entry.chapters?.includes(c)).length}</b>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={block.layout === 'compact' ? styles.gridCompact : styles.gridWide}>
                  {shown.map((entry) => (
                    <SlotCard key={entry.key} entry={entry} slot={byKey.get(entry.key)} websiteBase={websiteBase}
                      onOpen={() => { setOpened((n) => n + 1); setEditing({ entry, block }); }}
                      drag={block.id === 'zero' ? {
                        dragging: dragKey === entry.key,
                        over: overKey === entry.key && dragKey !== entry.key,
                        start: () => setDragKey(entry.key),
                        enter: () => setOverKey(entry.key),
                        end: () => { setDragKey(null); setOverKey(null); },
                        drop: () => { if (dragKey && dragKey !== entry.key) void swap(dragKey, entry.key); },
                      } : undefined} />
                  ))}
                </div>
                {block.id === 'zero' ? (
                  <p className={styles.note}>Kéo một ảnh thả lên vị trí khác để đổi chỗ hai ảnh. Slideshow chạy theo thứ tự 01 → 12.</p>
                ) : null}
              </section>
            );
          })}
        </>
      )}
      <SlotEditor
        key={opened}
        websiteBase={websiteBase}
        open={editing !== null}
        where={editing ? `${config.title} › ${editing.block.title}` : ''}
        entry={editing?.entry ?? null}
        slot={editing ? byKey.get(editing.entry.key) : undefined}
        onClose={() => setEditing(null)}
        onSaved={(row, message) => {
          setSaved((current) => ({ ...current, [row.key]: row }));
          setEditing(null);
          show('success', message);
        }}
      />
    </div>
  );
}

/** The hostname never changes while the page is open, so there is nothing to subscribe to. */
function noSubscribe(): () => void {
  return () => {};
}

interface SlotDrag {
  readonly dragging: boolean;
  readonly over: boolean;
  readonly start: () => void;
  readonly enter: () => void;
  readonly end: () => void;
  readonly drop: () => void;
}

function SlotCard({ entry, slot, websiteBase, onOpen, drag }: {
  readonly entry: CatalogueSlot;
  readonly slot: SiteImageSlot | undefined;
  readonly websiteBase: string;
  readonly onOpen: () => void;
  readonly drag?: SlotDrag | undefined;
}) {
  const state = slotState(slot);
  const preview = slotPreview(slot, websiteBase);
  return (
    <button type="button" className={styles.card} onClick={onOpen}
      aria-label={`${entry.label}: ${SLOT_STATE_LABEL[state]}. Bấm để thay ảnh`}
      draggable={drag !== undefined}
      data-dragging={drag?.dragging || undefined}
      data-over={drag?.over || undefined}
      onDragStart={drag ? (event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.key); drag.start(); } : undefined}
      onDragOver={drag ? (event) => { event.preventDefault(); drag.enter(); } : undefined}
      onDrop={drag ? (event) => { event.preventDefault(); drag.drop(); } : undefined}
      onDragEnd={drag ? drag.end : undefined}>
      <span className={styles.thumb} data-state={state}>
        {preview ? <img src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className={styles.thumbEmpty}>Chưa có ảnh</span>}
        {entry.order ? <span className={styles.order}>{String(entry.order).padStart(2, '0')}</span> : null}
        {entry.chapters && entry.chapters.length > 1 ? <span className={styles.shared}>Dùng chung {entry.chapters.length} chương</span> : null}
        <span className={styles.state} data-state={state}>{SLOT_STATE_LABEL[state]}</span>
      </span>
      <span className={styles.meta}>
        <strong>{entry.label}</strong>
        {entry.where ? <small>{entry.where}</small> : null}
        {entry.chapters ? (
          <span className={styles.uses}>{entry.chapters.map((c) => <span key={c}>{GUIDE_CHAPTER_LABEL[c]}</span>)}</span>
        ) : null}
      </span>
    </button>
  );
}
