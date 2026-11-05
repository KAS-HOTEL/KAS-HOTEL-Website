'use client';

/* eslint-disable @next/next/no-img-element -- see the note below. */

/*
 * A plain img, deliberately.
 *
 * next/image needs every image host listed in images.remotePatterns at build
 * time. The media delivery host is deployment configuration
 * (kas.media.delivery-base-url) and is not known when the bundle is built, so
 * this is the correct element here rather than a lint exception taken for
 * convenience. The intrinsic width and height the API returns are still
 * applied, which is what reserves the space and avoids a layout shift.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { mediaApi } from '@/lib/api/endpoints';
import { StorageUploadError, uploadToStorage } from '@/lib/api/endpoints/media';
import { ApiError } from '@/lib/api/errors';
import {
  coverOf,
  MEDIA_MIME_TYPES,
  nextDisplayOrder,
  rejectionLabel,
  selectUploads,
  type GalleryItem,
  type MediaMimeType,
} from '@/lib/domain/media';
import { Button, EmptyState, useToast } from '@/ui/primitives';
import { revalidateRoomGallery } from './actions';
import { ExternalMediaForm } from './ExternalMediaForm';
import styles from './Media.module.css';

/**
 * Doc 62's room category. A room gallery is bedrooms, beds, bathrooms and the
 * view from the window — never the lobby, which belongs to the property.
 */
const ROOM_CATEGORY = 'ROOM' as const;

/**
 * One picked file's progress through the batch.
 *
 * `retryable` is false for a file refused before it left the browser — a wrong
 * type or an oversized original will fail identically however many times it is
 * sent, so offering a retry would be a button that cannot work.
 */
interface UploadTask {
  readonly id: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'done' | 'failed';
  readonly error?: string;
  readonly retryable: boolean;
}

let taskSequence = 0;

function taskFor(file: File): UploadTask {
  // A counter, not the file name: an operator can pick two files of the same
  // name from different folders, and React needs distinct keys for both.
  taskSequence += 1;
  return { id: `t${taskSequence}`, file, status: 'pending', retryable: true };
}

function patch(
  tasks: readonly UploadTask[],
  id: string,
  change: Partial<UploadTask>,
): readonly UploadTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, ...change } : task));
}

/** Adds rows that are not already present, leaving the existing ones untouched. */
function merge(tasks: readonly UploadTask[], incoming: readonly UploadTask[]): readonly UploadTask[] {
  const known = new Set(tasks.map((task) => task.id));
  return [...tasks, ...incoming.filter((task) => !known.has(task.id))];
}

/**
 * One room type's photo gallery.
 *
 * <h2>The same three-step upload, a different owner</h2>
 *
 * `POST /media/upload-url` → `PUT` straight to R2 → `POST /media/{id}/complete`,
 * then `POST /media/{id}/links` with `ownerType: 'ROOM_TYPE'`. The bytes never
 * pass through Spring, and no second storage system was introduced: this is the
 * property gallery's flow with the owner changed, which is what
 * `media_link.owner_type` has always been for.
 *
 * <h2>Order is a position, not a swap</h2>
 *
 * Moving a photo sends every affected link its new index, so a move of three
 * places is three unambiguous writes rather than three swaps whose order
 * matters. The cover is a separate flag: a gallery can be reordered without
 * changing which photo leads it, and setting a new cover does not disturb the
 * sequence.
 *
 * <h2>Guests see this order</h2>
 *
 * `GET /public/properties/{slug}/room-types/{slug}/gallery` returns cover first,
 * then `display_order` — the same ordering this screen writes. So the sequence
 * an operator arranges here is the sequence a guest scrolls through, rather than
 * whatever order the rows happened to be inserted in.
 */
export function RoomMediaManager({
  propertyId,
  roomTypeId,
  roomTypeName,
  items,
}: {
  readonly propertyId: string;
  readonly roomTypeId: string;
  readonly roomTypeName: string;
  readonly items: readonly GalleryItem[];
}) {
  const router = useRouter();
  const { show } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * One row per picked file, kept after the batch finishes.
   *
   * A batch that half succeeded is the case worth designing for: the operator
   * needs to see which two of nine did not make it, and to retry exactly those
   * without finding the other seven again.
   */
  const [queue, setQueue] = useState<readonly UploadTask[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const uploading = queue.some((task) => task.status === 'uploading' || task.status === 'pending');
  const failedTasks = queue.filter((task) => task.status === 'failed');

  const cover = coverOf(items);
  const primary = items.find((item) => item.link.id === selected) ?? cover ?? items[0];

  async function refresh(): Promise<void> {
    await revalidateRoomGallery(propertyId, roomTypeId);
    router.refresh();
  }

  /** Runs one media call, turning every failure into a sentence and never a stack. */
  async function run(label: string, work: () => Promise<void>): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (caught) {
      if (caught instanceof StorageUploadError) {
        setError('Tải ảnh lên kho lưu trữ thất bại. Vui lòng thử lại.');
      } else if (caught instanceof ApiError) {
        setError(messageFor(caught));
      } else {
        setError('Không thực hiện được. Vui lòng thử lại.');
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * One file, all the way from picked to placed on this room.
   *
   * The three-step flow is unchanged — `upload-url`, a direct `PUT` to R2,
   * `complete` — and the bytes still never pass through Spring. What is new is
   * that the caller supplies the `displayOrder` rather than deriving it from
   * `items`: within a batch, `items` has not been refetched yet, so every file
   * would otherwise claim the same position.
   */
  async function uploadOne(file: File, displayOrder: number): Promise<void> {
    const dimensions = await intrinsicSize(file);
    const minted = await mediaApi.uploadUrl({
      mimeType: file.type as MediaMimeType,
      category: ROOM_CATEGORY,
      ...dimensions,
    }, { ownerType: 'ROOM_TYPE', ownerId: roomTypeId });

    // Straight to storage: `lib/api` would attach KAS cookies and a CSRF header
    // to a signed URL on an origin that is not KAS.
    await uploadToStorage(minted.uploadUrl, file);
    const asset = await mediaApi.complete(minted.mediaAssetId);

    const link = await mediaApi.attach(asset.id, {
      ownerType: 'ROOM_TYPE',
      ownerId: roomTypeId,
      displayOrder,
    });

    // The first photo a room ever gets is its cover; nothing else would be. Only
    // the first of a batch, and only when the room had none — after that the
    // choice is the operator's, through the ★ on each thumbnail.
    if (items.length === 0 && displayOrder === nextDisplayOrder(items)) {
      await mediaApi.setCover(asset.id, link.id);
    }
  }

  /**
   * Uploads a batch, one file at a time, and reports each result as it lands.
   *
   * <h2>Sequential, deliberately</h2>
   *
   * Parallel uploads would finish out of order, and the order they finish in is
   * the order they would appear in — an operator who picked a batch in a
   * particular sequence would get it shuffled by whichever file happened to be
   * smallest. One at a time also keeps a hotel's uplink usable while it runs.
   *
   * <h2>One failure does not end the batch</h2>
   *
   * The remaining files still upload. A single unreadable file among nine should
   * cost that file, not the other eight — and the row for it stays on screen,
   * with its reason, until it is retried or the picker is used again.
   */
  async function runBatch(tasks: readonly UploadTask[]): Promise<void> {
    setError(null);
    setQueue((current) => merge(current, tasks));

    let order = nextDisplayOrder(items);
    let succeeded = 0;

    for (const task of tasks) {
      setQueue((current) => patch(current, task.id, { status: 'uploading' }));
      try {
        await uploadOne(task.file, order);
        order += 1;
        succeeded += 1;
        setQueue((current) => patch(current, task.id, { status: 'done' }));
      } catch (caught) {
        setQueue((current) =>
          patch(current, task.id, { status: 'failed', error: reasonFor(caught) }),
        );
      }
    }

    const failedCount = tasks.length - succeeded;
    if (succeeded > 0) {
      show('success', `Đã thêm ${succeeded} ảnh phòng.`);
      // Only after the batch: one refetch, not one per file.
      await refresh();
    }
    if (failedCount > 0) {
      setError(
        `${failedCount}/${tasks.length} ảnh không tải lên được. Xem chi tiết bên dưới và thử lại.`,
      );
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>): void {
    const picked = [...(event.target.files ?? [])];
    // The input is reset so choosing the same files twice still fires a change.
    event.target.value = '';
    if (picked.length === 0) {
      return;
    }

    // A fresh pick replaces the previous batch's rows: the old ones have either
    // landed in the gallery below or been retried, and keeping them would make
    // the list grow without ever meaning anything.
    const { accepted, rejected } = selectUploads(picked);
    const tasks = accepted.map(taskFor);
    const refused = rejected.map(({ file, reason }) => ({
      ...taskFor(file),
      status: 'failed' as const,
      // Refused before a byte left the browser, so there is nothing to retry —
      // the operator has to pick a different file.
      error: rejectionLabel(reason),
      retryable: false,
    }));

    setQueue([...tasks, ...refused]);
    if (rejected.length > 0 && accepted.length === 0) {
      setError('Không có tệp nào hợp lệ. Xem chi tiết bên dưới.');
      return;
    }
    void runBatch(tasks);
  }

  /** Re-runs only the files that failed, keeping their rows in place. */
  function onRetry(): void {
    const again = failedTasks.filter((task) => task.retryable).map((task) => taskFor(task.file));
    if (again.length === 0) {
      return;
    }
    setQueue((current) => current.filter((task) => !task.retryable || task.status !== 'failed'));
    void runBatch(again);
  }

  /** Moves one photo one place, rewriting only the two positions that change. */
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
    });
  }

  return (
    <div className={styles.roomGallery}>
      <ExternalMediaForm propertyId={propertyId} ownerType="ROOM_TYPE" ownerId={roomTypeId} displayOrder={nextDisplayOrder(items)} disabled={busy !== null} />
      <div className={styles.roomGalleryHead}>
        <div>
          <h2 className={styles.roomGalleryTitle}>Ảnh phòng</h2>
          <p className={styles.roomGalleryNote}>
            {items.length === 0
              ? 'Chưa có ảnh nào. Ảnh đầu tiên sẽ là ảnh chính.'
              : `${items.length} ảnh · ảnh chính hiển thị đầu tiên với khách.`}
          </p>
        </div>

        <label className={styles.uploadButton} data-disabled={uploading || undefined}>
          {uploading ? 'Đang tải lên…' : 'Tải ảnh lên'}
          <input
            type="file"
            className={styles.uploadInput}
            accept={MEDIA_MIME_TYPES.join(',')}
            /* Many at once — Ctrl/Shift in the native picker, or a drag of
               several files onto it. The gallery has always been able to hold
               them; only the picker could not offer them. */
            multiple
            /* Disabled while a batch runs, so a second pick cannot start a
               parallel batch that would interleave display orders with the
               first. */
            disabled={uploading || busy !== null}
            onChange={onPick}
          />
        </label>
      </div>

      {error === null ? null : (
        <p className={styles.roomGalleryError} role="alert">
          <span>{error}</span>
          {failedTasks.some((task) => task.retryable) ? (
            <Button variant="secondary" onClick={onRetry} disabled={uploading || busy !== null}>
              Thử lại
            </Button>
          ) : null}
        </p>
      )}

      {/*
        The batch, file by file, and it stays after the batch ends.

        A progress line that disappears on completion is one an operator cannot
        check afterwards — and the whole point of showing it is the run where
        two of nine did not make it. Each row states what actually happened to
        that file; nothing here is a simulated percentage.
      */}
      {queue.length === 0 ? null : (
        <ul className={styles.uploadQueue} aria-live="polite">
          {queue.map((task) => (
            <li key={task.id} className={styles.uploadQueueItem} data-status={task.status}>
              <span className={styles.uploadQueueName}>{task.file.name}</span>
              <span className={styles.uploadQueueStatus}>
                {task.status === 'pending' ? 'Đang chờ' : null}
                {task.status === 'uploading' ? 'Đang tải lên…' : null}
                {task.status === 'done' ? 'Đã tải lên' : null}
                {task.status === 'failed' ? `Thất bại — ${task.error ?? 'không rõ lý do'}` : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <EmptyState title="Phòng này chưa có ảnh">
          Khách chọn phòng bằng ảnh trước khi đọc mô tả. Tải lên ảnh giường, phòng tắm và tầm nhìn
          của chính loại phòng này — ảnh toàn khách sạn thuộc mục Hình ảnh của khách sạn.
        </EmptyState>
      ) : (
        <>
          {primary ? (
            <figure className={styles.roomPrimary}>
              {/* The asset's own delivery URL. Nothing here constructs or guesses
                  one, and a deployment with no delivery base configured shows
                  the reason rather than a broken image. */}
              {primary.asset.url === null ? (
                <span className={styles.roomNoPreview}>
                  Chưa cấu hình đường dẫn ảnh cho môi trường này.
                </span>
              ) : (
                <img
                  className={styles.roomPrimaryImage}
                  src={primary.asset.url}
                  alt={`${roomTypeName} — ảnh phòng`}
                />
              )}
              {primary.link.isCover ? (
                <figcaption className={styles.roomPrimaryBadge}>Ảnh chính</figcaption>
              ) : null}
            </figure>
          ) : null}

          <ul className={styles.roomThumbs}>
            {items.map((item, index) => (
              <li key={item.link.id} className={styles.roomThumb}>
                <button
                  type="button"
                  className={styles.roomThumbButton}
                  data-active={item.link.id === primary?.link.id || undefined}
                  onClick={() => setSelected(item.link.id)}
                  aria-label={`Xem ảnh ${index + 1}`}
                >
                  {item.asset.url === null ? (
                    <span className={styles.roomThumbBlank} aria-hidden="true" />
                  ) : (
                    <img src={item.asset.url} alt="" />
                  )}
                  {item.link.isCover ? (
                    <span className={styles.roomThumbCover}>Chính</span>
                  ) : null}
                </button>

                <div className={styles.roomThumbActions}>
                  <button
                    type="button"
                    className={styles.roomThumbAction}
                    disabled={index === 0 || busy !== null || uploading}
                    onClick={() => void move(index, -1)}
                    aria-label={`Chuyển ảnh ${index + 1} lên trước`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className={styles.roomThumbAction}
                    disabled={index === items.length - 1 || busy !== null || uploading}
                    onClick={() => void move(index, 1)}
                    aria-label={`Chuyển ảnh ${index + 1} xuống sau`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className={styles.roomThumbAction}
                    disabled={item.link.isCover || busy !== null || uploading}
                    onClick={() =>
                      void run(`cover-${item.link.id}`, async () => {
                        await mediaApi.setCover(item.asset.id, item.link.id);
                        show('success', 'Đã đặt ảnh chính.');
                      })
                    }
                    aria-label={`Đặt ảnh ${index + 1} làm ảnh chính`}
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    className={`${styles.roomThumbAction} ${styles.roomThumbDelete}`}
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`delete-${item.link.id}`, async () => {
                        // Detach, not delete: the asset stays in the library and
                        // may be placed on another owner. `ON DELETE RESTRICT`
                        // on media_link means the row is the only thing removed.
                        await mediaApi.detach(item.asset.id, item.link.id);
                        show('success', 'Đã gỡ ảnh khỏi phòng.');
                      })
                    }
                    aria-label={`Gỡ ảnh ${index + 1} khỏi phòng`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The image's real pixel dimensions, read from the file before it is uploaded.
 *
 * `media_asset.width`/`height` are what a gallery uses to reserve space and
 * avoid a layout shift, so guessing them would defeat the point. This is the
 * same implementation `PropertyMediaManager` uses — deliberately, rather than
 * a second one that could drift: `createImageBitmap` decodes without attaching
 * an element to the document, and a browser that lacks it or a file it cannot
 * decode yields neither dimension. The columns are nullable for exactly that.
 */
/**
 * One failure, as a sentence an operator can act on.
 *
 * The same three cases `run` distinguishes, kept apart for the same reason:
 * "storage refused the write" and "the API refused the request" have different
 * fixes, and a vendor's XML is never shown to a Partner.
 */
function reasonFor(caught: unknown): string {
  if (caught instanceof StorageUploadError) {
    return 'không tải được lên kho lưu trữ';
  }
  if (caught instanceof ApiError) {
    return messageFor(caught);
  }
  return 'lỗi không xác định';
}

async function intrinsicSize(file: File): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap !== 'function') {
    return {};
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}
