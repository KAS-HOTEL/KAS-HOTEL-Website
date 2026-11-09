'use client';

/* eslint-disable @next/next/no-img-element -- see the note below. */

/*
 * Plain img elements, deliberately.
 *
 * next/image needs every image host listed in images.remotePatterns at build
 * time. The media delivery host is deployment configuration
 * (kas.media.delivery-base-url) and is not known when the bundle is built, so
 * this is the correct element here — the same reasoning the customer galleries
 * carry.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { mediaApi } from '@/lib/api/endpoints';
import { StorageUploadError, uploadToStorage } from '@/lib/api/endpoints/media';
import { ApiError } from '@/lib/api/errors';
import {
  coverOf,
  GALLERY_GROUPS,
  galleryGroupCounts,
  galleryGroupOf,
  MEDIA_MIME_TYPES,
  mediaCategoryLabel,
  mediaStatusLabel,
  nextDisplayOrder,
  type GalleryGroupKey,
  type GalleryItem,
  type MediaAssetView,
  type MediaCategory,
  type MediaMimeType,
} from '@/lib/domain/media';
import { Button, EmptyState, Select, useToast } from '@/ui/primitives';
import { revalidateGallery } from './actions';
import { ExternalMediaForm } from './ExternalMediaForm';
import { intrinsicSize, isSupportedImage, storageMessage } from './upload';
import { SelectionBar } from './SelectionBar';
import { persistOrder, useGalleryArrange } from './useGalleryArrange';
import styles from './Media.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * A property's images — the screen that makes the publish checklist's hero-image
 * requirement reachable without touching the database.
 *
 * <h2>What this can and cannot do</h2>
 *
 * It uploads a file, attaches it to this property and chooses the cover.
 *
 * <h2>The upload is three requests and none of them carries the bytes here</h2>
 *
 * Doc 62 §4: ask for a URL, `PUT` the file straight to storage, then confirm.
 * Step 16A.49 answered OQ-106, so the screen no longer has to explain that the
 * file itself cannot be accepted — it takes one.
 *
 * The middle step deliberately does not go through `lib/api`: that client sends
 * KAS cookies and a CSRF header, and the signed URL points at a storage origin
 * that is not KAS. See `uploadToStorage`.
 *
 * <h2>Only uploaded images can be attached</h2>
 *
 * `POST /admin/media` — the descriptor-only registration — is no longer reachable
 * from this screen. It still exists for the doc 62 §3 folder import, but offering
 * it to a Partner beside a real upload would let them create a cover with no
 * bytes behind it: the publish checklist would pass and the guest page would show
 * nothing.
 *
 * <h2>Cover is one request</h2>
 *
 * `PATCH /links/{id}/cover` clears any previous cover in the same statement, and
 * the database holds the invariant — `UNIQUE (owner_type, owner_id) WHERE
 * is_cover`. So this never clears-then-sets, and there is no window in which the
 * property has two covers or none.
 */
export function PropertyMediaManager({
  propertyId,
  items,
  library,
}: {
  readonly propertyId: string;
  readonly items: readonly GalleryItem[];
  readonly library: readonly MediaAssetView[];
}) {
  const router = useRouter();
  const { show } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<MediaCategory>('EXTERIOR');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [attachId, setAttachId] = useState('');
  const [dragging, setDragging] = useState(false);
  /** The gallery group shown; reordering needs the whole gallery, so only on "all". */
  const [group, setGroup] = useState<'all' | GalleryGroupKey>('all');
  /**
   * The real `<input type="file">`, kept so its value can be cleared.
   *
   * A file input fires no change event when the same file is picked twice, so
   * after an upload — or after the operator clears the choice — the element has
   * to be emptied or re-picking the photograph that just failed does nothing.
   */
  const fileInput = useRef<HTMLInputElement>(null);

  /** One place to take files, whether they were dropped or chosen. */
  function choose(picked: readonly File[]): void {
    setError(null);
    setFiles(picked);
    setDragging(false);
  }

  /** Previews of the chosen files, revoked when the choice changes. */
  const previews = useMemo(
    () => files.map((chosen) => ({ file: chosen, url: URL.createObjectURL(chosen) })),
    [files],
  );
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  const cover = coverOf(items);
  const counts = useMemo(() => galleryGroupCounts(items.map((item) => item.asset.category)), [items]);
  const shown = useMemo(
    () => items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => group === 'all' || galleryGroupOf(item.asset.category) === group),
    [items, group],
  );
  const arrange = useGalleryArrange({
    ids: shown.map(({ item }) => item.link.id),
    canReorder: group === 'all' && busy === null,
    onReorder: (next) => void run('reorder', () => persistOrder(items, next), 'Đã sắp xếp lại ảnh.'),
  });
  const picked = items.filter((item) => arrange.isSelected(item.link.id));

  /** Removes every selected photo except the cover, which a gallery must keep. */
  function removeSelected() {
    const targets = picked.filter((item) => !item.link.isCover);
    return run('remove-many', async () => {
      for (const item of targets) await mediaApi.detach(item.asset.id, item.link.id);
      arrange.clear();
    }, `Đã gỡ ${targets.length} ảnh khỏi khách sạn.`);
  }

  /** Library assets not already placed on this property. */
  const attachable = useMemo(() => {
    const placed = new Set(items.map((item) => item.asset.id));
    return library.filter((asset) => !placed.has(asset.id));
  }, [items, library]);

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await revalidateGallery(propertyId);
      router.refresh();
      show('success', done);
    } catch (caught) {
      // The console mapping: the backend's own words, which name the field and
      // the reason. Inventing a friendlier sentence would hide both.
      //
      // A storage failure is separated out because it is not the KAS API
      // talking, and because the two ways it fails need different actions from
      // different people — see storageMessage.
      setError(
        caught instanceof StorageUploadError ? storageMessage(caught)
          : caught instanceof ApiError ? messageFor(caught)
            : 'Không thực hiện được.',
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * Doc 62 §4, end to end: mint a URL, PUT the bytes to storage, confirm, attach.
   *
   * The type comes from the file rather than a dropdown — the browser knows what
   * it picked, and the signature binds that type, so a mismatch would be refused
   * by storage anyway. An unsupported type is caught here so the Partner is told
   * before a request rather than after one.
   */
  function upload() {
    if (files.length === 0) {
      return undefined;
    }
    const chosen = [...files];
    if (chosen.some((one) => !isSupportedImage(one.type))) {
      setError('Định dạng ảnh không được hỗ trợ. Hãy dùng JPEG, PNG, WebP hoặc AVIF.');
      return undefined;
    }

    // One URL per asset, so several photos are several uploads, one after another,
    // each placed after the last.
    return run(
      'upload',
      async () => {
        let order = nextDisplayOrder(items);
        for (const one of chosen) {
          const dimensions = await intrinsicSize(one);
          const minted = await mediaApi.uploadUrl({
            mimeType: one.type as MediaMimeType,
            category,
            ...dimensions,
          }, { ownerType: 'PROPERTY', ownerId: propertyId });

          await uploadToStorage(minted.uploadUrl, one);
          const asset = await mediaApi.complete(minted.mediaAssetId);

          await mediaApi.attach(asset.id, { ownerType: 'PROPERTY', ownerId: propertyId, displayOrder: order });
          order += 1;
        }
        setFiles([]);
        if (fileInput.current !== null) {
          fileInput.current.value = '';
        }
      },
      chosen.length === 1 ? 'Đã tải ảnh lên và gắn vào khách sạn.' : `Đã tải ${chosen.length} ảnh lên khách sạn.`,
    );
  }

  /** Files a photo under another gallery group; a photo already in the group is left as it is. */
  function regroup(item: GalleryItem, key: GalleryGroupKey) {
    const target = GALLERY_GROUPS.find((g) => g.key === key);
    if (!target || galleryGroupOf(item.asset.category) === key) {
      return undefined;
    }
    return run(`category-${item.link.id}`, () => mediaApi.setCategory(item.asset.id, target.primary),
      `Đã chuyển ảnh sang “${target.label}”.`);
  }

  function attachExisting() {
    const assetId = attachId;
    return run(
      'attach',
      () =>
        mediaApi.attach(assetId, {
          ownerType: 'PROPERTY',
          ownerId: propertyId,
          displayOrder: nextDisplayOrder(items),
        }),
      'Đã gắn ảnh có sẵn vào khách sạn.',
    );
  }

  /**
   * Moves one photo one place, rewriting only the two positions that change.
   *
   * `setOrder` takes the link's new absolute index rather than a direction, so a
   * swap is two unambiguous writes whose order does not matter. The same
   * implementation as `RoomMediaManager` — deliberately, rather than a second
   * one that could drift.
   */
  async function move(index: number, delta: number): Promise<void> {
    const target = index + delta;
    const a = items[index];
    const b = items[target];
    if (!a || !b) {
      return;
    }
    await run(`move-${a.link.id}`, async () => {
      await mediaApi.setOrder(a.asset.id, a.link.id, target);
      await mediaApi.setOrder(b.asset.id, b.link.id, index);
    }, 'Đã đổi thứ tự ảnh.');
  }

  return (
    <div className={styles.manager}>
      <ExternalMediaForm propertyId={propertyId} ownerType="PROPERTY" ownerId={propertyId} displayOrder={nextDisplayOrder(items)} disabled={busy !== null} />
      {/*
        SECTION 1 — the cover, as a photograph.

        This used to be a card containing the asset's UUID in a monospace font
        beside a "Đã chọn" badge. An operator cannot tell from a UUID whether the
        right picture is leading their hotel page; they can tell instantly from
        the picture.
      */}
      <section className={styles.coverSection} aria-labelledby="cover-title">
        <div className={styles.coverHead}>
          <h2 className={styles.sectionTitle} id="cover-title">
            Ảnh đại diện
          </h2>
          <p className={styles.sectionNote}>
            {cover
              ? 'Ảnh này dẫn trang khách sạn của bạn.'
              : 'Bắt buộc trước khi mở bán. Chọn một ảnh trong thư viện bên dưới.'}
          </p>
        </div>

        {cover === null ? (
          <div className={styles.coverEmpty}>
            <span className={styles.coverEmptyText}>Chưa chọn ảnh đại diện</span>
          </div>
        ) : cover.asset.url === null ? (
          <div className={styles.coverEmpty}>
            <span className={styles.coverEmptyText}>
              Chưa cấu hình đường dẫn ảnh cho môi trường này.
            </span>
          </div>
        ) : (
          <div className={styles.coverPreview}>
            <img className={styles.coverImage} src={cover.asset.url} alt="Ảnh đại diện khách sạn" />
          </div>
        )}
      </section>

      {/* SECTION 2 — the library. */}
      <section className={styles.librarySection} aria-labelledby="library-title">
        <div className={styles.libraryHead}>
          <h2 className={styles.sectionTitle} id="library-title">
            Thư viện ảnh
          </h2>
          <span className={styles.libraryCount}>
            {items.length === 0 ? 'Chưa có ảnh' : `${items.length} ảnh`}
          </span>
        </div>

        {error ? (
          <p className={propertyStyles.publishError} role="alert">
            {error}
          </p>
        ) : null}

        {items.length === 0 ? null : (
          <div className={styles.groupFilter} role="group" aria-label="Lọc ảnh theo danh mục">
            <button type="button" className={styles.groupChip} aria-pressed={group === 'all'}
              onClick={() => setGroup('all')}>
              Tất cả <span>{items.length}</span>
            </button>
            {GALLERY_GROUPS.map((g) => (
              <button key={g.key} type="button" className={styles.groupChip} aria-pressed={group === g.key}
                onClick={() => setGroup(g.key)}>
                {g.label} <span>{counts[g.key]}</span>
              </button>
            ))}
          </div>
        )}
        {group !== 'all' && shown.length > 0 ? (
          <p className={styles.sectionNote}>Chọn “Tất cả” để đổi thứ tự ảnh.</p>
        ) : null}
        {shown.length > 0 ? (
          <SelectionBar
            total={shown.length}
            selected={picked.length}
            removable={picked.filter((item) => !item.link.isCover).length}
            busy={busy !== null}
            coverLabel="Ảnh đại diện"
            onSelectAll={arrange.selectAll}
            onClear={arrange.clear}
            onRemove={() => void removeSelected()}
          />
        ) : null}

        {items.length === 0 ? (
          <EmptyState title="Khách sạn chưa có ảnh nào">
            Tải ảnh lên bên dưới, rồi chọn một ảnh làm ảnh đại diện.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="Chưa có ảnh trong danh mục này">
            Chọn danh mục khác, hoặc đổi danh mục của một ảnh có sẵn.
          </EmptyState>
        ) : (
          <ul className={`${styles.grid} ${styles.arrangeGrid}`} {...arrange.containerProps}>
            {arrange.box ? <li aria-hidden="true" className={styles.marquee} style={arrange.box} /> : null}
            {shown.map(({ item, index }) => (
              <li
                key={item.link.id}
                className={styles.tile}
                data-cover={item.link.isCover || undefined}
                {...arrange.itemProps(item.link.id)}
              >
                <div className={styles.tileImageWrap}>
                  <label className={styles.pick}>
                    <input
                      type="checkbox"
                      checked={arrange.isSelected(item.link.id)}
                      onChange={() => undefined}
                      onClick={(event) => arrange.toggle(item.link.id, event)}
                      aria-label={`Chọn ảnh ${index + 1}`}
                    />
                  </label>
                  {item.asset.url === null ? (
                    <span className={styles.tileBlank}>Không có bản xem trước</span>
                  ) : (
                    <img
                      className={styles.tileImage}
                      src={item.asset.url}
                      alt={`Ảnh ${index + 1} — ${mediaCategoryLabel(item.asset.category)}`}
                    />
                  )}
                  {item.link.isCover ? (
                    <span className={styles.tileCoverBadge}>Ảnh đại diện</span>
                  ) : null}
                </div>

                <div className={styles.tileMeta}>
                  {/* The category is what an operator recognises. The asset id was
                      here and is not any more: it identifies a row, not a
                      photograph. */}
                  <select
                    className={styles.tileCategorySelect}
                    aria-label={`Danh mục của ảnh ${index + 1}`}
                    value={galleryGroupOf(item.asset.category)}
                    disabled={busy !== null}
                    onChange={(event) => void regroup(item, event.target.value as GalleryGroupKey)}
                  >
                    {GALLERY_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                  </select>
                  <span className={styles.tileStatus}>{mediaStatusLabel(item.link.status)}</span>
                </div>

                <div className={styles.tileActions}>
                  <button
                    type="button"
                    className={styles.tileAction}
                    disabled={group !== 'all' || index === 0 || busy !== null}
                    onClick={() => void move(index, -1)}
                    aria-label={`Chuyển ảnh ${index + 1} lên trước`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className={styles.tileAction}
                    disabled={group !== 'all' || index === items.length - 1 || busy !== null}
                    onClick={() => void move(index, 1)}
                    aria-label={`Chuyển ảnh ${index + 1} xuống sau`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className={styles.tileAction}
                    disabled={item.link.isCover || busy !== null}
                    onClick={() =>
                      run(
                        `cover-${item.link.id}`,
                        () => mediaApi.setCover(item.asset.id, item.link.id),
                        'Đã đặt làm ảnh đại diện.',
                      )
                    }
                    aria-label={`Đặt ảnh ${index + 1} làm ảnh đại diện`}
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    className={`${styles.tileAction} ${styles.tileDelete}`}
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `detach-${item.link.id}`,
                        // Detach, not delete: the asset stays in the library and
                        // may be placed on another owner. `ON DELETE RESTRICT` on
                        // media_link means the row is the only thing removed.
                        () => mediaApi.detach(item.asset.id, item.link.id),
                        'Đã gỡ ảnh khỏi khách sạn.',
                      )
                    }
                    aria-label={`Gỡ ảnh ${index + 1} khỏi khách sạn`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SECTION 3 — upload. */}
      <section className={styles.uploadSection} aria-labelledby="upload-title">
        <div className={styles.libraryHead}>
          <h2 className={styles.sectionTitle} id="upload-title">
            Tải ảnh lên
          </h2>
          <span className={styles.libraryCount}>JPEG · PNG · WebP · AVIF</span>
        </div>

        {/*
          The dropzone leads and the two controls sit beside it.

          This was three cells of a form row: a category select, a native
          `<input type="file">` rendering Chrome's "Choose File / No file
          chosen", and a button. The file input is still exactly that element —
          it has to be, it is the only way to open a file picker — but it is now
          visually hidden behind a label that fills the whole zone, so clicking
          anywhere in the area opens the picker and the element stays focusable
          and announced for the keyboard.
        */}
        <div className={styles.uploadMain}>
          <div className={styles.uploadSide}>
            <Select
              id="media-category"
              label="Danh mục"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value as MediaCategory)}
              options={GALLERY_GROUPS.map((g) => ({ value: g.primary, label: g.label }))}
            />
            <Button onClick={upload} disabled={busy !== null || files.length === 0}>
              {busy === 'upload' ? 'Đang tải lên…' : files.length > 1 ? `Tải ${files.length} ảnh lên` : 'Tải ảnh lên'}
            </Button>
          </div>

          <div
            className={styles.dropzone}
            data-dragging={dragging ? 'true' : undefined}
            data-chosen={files.length === 0 ? undefined : 'true'}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              choose(Array.from(event.dataTransfer.files));
            }}
          >
            {/*
              Named on the element itself, not only by the label beside it: the
              label is replaced by the chosen-file panel once there is a file,
              and an input whose name disappears mid-interaction is unusable
              with a screen reader. The name repeats the visible words so voice
              control can address it by what it says (WCAG 2.5.3).
            */}
            <input
              ref={fileInput}
              className={styles.dropzoneInput}
              id="media-file"
              type="file"
              multiple
              aria-label="Chọn tệp ảnh"
              accept={MEDIA_MIME_TYPES.join(',')}
              onChange={(event) => choose(Array.from(event.target.files ?? []))}
            />

            {files.length === 0 ? (
              <label className={styles.dropzoneBody} htmlFor="media-file">
                <svg
                  className={styles.dropzoneIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                <span className={styles.dropzoneTitle}>Chọn tệp ảnh</span>
                <span className={styles.dropzoneHint}>Kéo thả một hoặc nhiều ảnh vào đây, hoặc chọn tệp</span>
                <span className={styles.dropzoneTypes}>JPEG, PNG, WebP, AVIF</span>
              </label>
            ) : (
              <div className={styles.dropzoneChosen}>
                {/* Seen before saving: each chosen photo, its name and size. */}
                <ul className={styles.previewList} aria-label="Ảnh sẽ tải lên">
                  {previews.map((preview) => (
                    <li key={preview.url} className={styles.previewItem}>
                      <img className={styles.previewImage} src={preview.url} alt="" />
                      <span className={styles.dropzoneFile}>{preview.file.name}</span>
                      <span className={styles.dropzoneTypes}>{fileSize(preview.file.size)}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="secondary"
                  onClick={() => {
                    choose([]);
                    if (fileInput.current !== null) {
                      fileInput.current.value = '';
                    }
                  }}
                  disabled={busy !== null}
                >
                  Chọn ảnh khác
                </Button>
              </div>
            )}
          </div>
        </div>

        {attachable.length > 0 ? (
          <div className={styles.uploadRow}>
            <Select
              id="media-existing"
              label="Ảnh có sẵn trong thư viện"
              placeholder="Chọn một ảnh"
              value={attachId}
              onChange={(event) => setAttachId(event.target.value)}
              options={attachable.map((asset) => ({
                value: asset.id,
                // The first group of the id, which is enough to tell two library
                // entries apart without making the option unreadably wide.
                label: `${mediaCategoryLabel(asset.category)} — ${asset.id.split('-')[0] ?? asset.id}`,
              }))}
            />
            <div className={styles.uploadAction}>
              <Button
                variant="secondary"
                onClick={attachExisting}
                disabled={busy !== null || attachId === ''}
              >
                {busy === 'attach' ? 'Đang gắn…' : 'Gắn ảnh có sẵn'}
              </Button>
            </div>
          </div>
        ) : null}

        <p className={styles.uploadNote}>
          Ảnh tải lên hoặc gắn vào sẽ hiện ngay trên website. Mô tả ảnh (alt text) được tự đặt theo
          tên khách sạn hoặc hạng phòng và nhóm ảnh, bằng tiếng Việt và tiếng Anh.
        </p>
      </section>
    </div>
  );
}

/**
 * A chosen file's size, for the operator rather than for a machine.
 *
 * Binary units, because that is what an operating system's file dialog shows
 * beside the same photograph, and one decimal place, because "2,4 MB" is the
 * answer to "is this the big one or the small one" and "2,411,724 bytes" is not.
 */
function fileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  return kb < 1024
    ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(kb)} KB`
    : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(kb / 1024)} MB`;
}



