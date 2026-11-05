/**
 * Media assets and the links that place them — doc 62.
 *
 * <h2>An asset is a record, not a file</h2>
 *
 * `POST /admin/media` registers a *descriptor*: mime type, category and the
 * optional intrinsic dimensions. The bytes are a separate concern that no frozen
 * document has settled — `POST /admin/media/upload-url` is deliberately not
 * implemented, because a pre-signed URL needs an object-storage provider nobody
 * has chosen (OQ-106). So an asset here can be addressed, described, attached and
 * made a cover long before it has an image behind it, and the console must say so
 * rather than imply a file was received.
 *
 * <h2>The link carries the placement</h2>
 *
 * `displayOrder`, `isCover` and `status` live on the **link**, not the asset, so
 * one asset can be a property's cover and a room's third photo at once. The
 * database holds the cover invariant directly —
 * `UNIQUE (owner_type, owner_id) WHERE is_cover` — which is why setting a cover
 * is a single request and never a clear-then-set pair.
 */

/** The frozen `media_category` enum — doc 62 §2.1. */
export const MEDIA_CATEGORIES = [
  'EXTERIOR',
  'LOBBY',
  'ROOM',
  'DINING',
  'FACILITY',
  'ROOFTOP',
  'NEIGHBOURHOOD',
  'DETAIL',
  'STAFF',
  'EVENT',
  'DOCUMENT',
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** The only mime types `RegisterMediaRequest` accepts. */
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];

export type MediaStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type MediaOwnerType = 'PROPERTY' | 'ROOM_TYPE';

/**
 * `MediaAssetView`.
 *
 * There is no `storageKey` and no `partnerId`, in the backend view either: the
 * key is internal to the repository and the partner is whatever the caller's
 * scope already reaches.
 */
export interface MediaAssetView {
  readonly id: string;
  readonly mimeType: string;
  readonly category: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly sizeBytes: number | null;
  readonly status: MediaStatus;
  /**
   * Where the image can be fetched — the same delivery URL the public gallery
   * returns, built from the opaque asset id (doc 62 §6), never the storage key.
   *
   * `null` when no delivery base URL is configured for the deployment, so a
   * gallery degrades to "no preview" rather than to a broken image.
   */
  readonly url: string | null;
}

/** `MediaLinkView` — one placement of one asset on one owner. */
export interface MediaLinkView {
  readonly id: string;
  readonly mediaAssetId: string;
  readonly ownerType: MediaOwnerType;
  readonly ownerId: string;
  readonly displayOrder: number;
  readonly isCover: boolean;
  readonly status: MediaStatus;
}

/**
 * `MediaCoverView` — one owner's cover, for a list that shows many owners.
 *
 * Narrower than `MediaAssetView` on purpose: a portfolio card needs the picture
 * and the space to reserve for it, not the category, status or byte count. The
 * one field it adds is `ownerId`, which is how a cover is matched to its row.
 *
 * `url` is `null` when the deployment has no delivery base configured — the same
 * degradation `MediaAssetView` makes, so a card falls back to its placeholder
 * rather than to a broken frame.
 */
export interface MediaCoverView {
  readonly ownerId: string;
  readonly mediaAssetId: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly url: string | null;
}

/**
 * `RegisterMediaRequest`.
 *
 * The storage key is **not** here: the server generates it, so a caller cannot
 * name a location it should not reach.
 */
export interface RegisterMediaRequest {
  readonly mimeType: MediaMimeType;
  readonly category: MediaCategory;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
}

/**
 * `UploadUrlView` — doc 62 §4 step 1's `{ uploadUrl, mediaAssetId, expiresAt }`.
 *
 * `uploadUrl` is signed, short-lived, and bound to one storage key and one
 * content type. It is the only thing about storage that reaches the browser:
 * there is no bucket, endpoint or key field here, and the backend has none to
 * give.
 */
export interface UploadUrlView {
  readonly uploadUrl: string;
  readonly mediaAssetId: string;
  /** ISO-8601. After this the URL stops working and a new one must be minted. */
  readonly expiresAt: string;
}

/** `AttachMediaRequest`. Cover is not settable here — it is its own request. */
export interface AttachMediaRequest {
  readonly ownerType: MediaOwnerType;
  readonly ownerId: string;
  readonly displayOrder: number;
}

/** An asset paired with its placement on the owner being edited. */
export interface GalleryItem {
  readonly asset: MediaAssetView;
  readonly link: MediaLinkView;
}

const CATEGORY_LABELS: Readonly<Record<MediaCategory, string>> = {
  EXTERIOR: 'Ngoại thất',
  LOBBY: 'Sảnh',
  ROOM: 'Phòng',
  DINING: 'Ẩm thực',
  FACILITY: 'Tiện ích',
  ROOFTOP: 'Sân thượng',
  NEIGHBOURHOOD: 'Khu vực lân cận',
  DETAIL: 'Chi tiết',
  STAFF: 'Nhân sự',
  EVENT: 'Sự kiện',
  DOCUMENT: 'Tài liệu',
};

/** The category name in Vietnamese; unknown values are shown verbatim. */
export function mediaCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as MediaCategory] ?? category;
}

const STATUS_LABELS: Readonly<Record<MediaStatus, string>> = {
  DRAFT: 'Nháp',
  PUBLISHED: 'Đã xuất bản',
  ARCHIVED: 'Đã lưu trữ',
};

export function mediaStatusLabel(status: MediaStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * The gallery in the order the backend already sorts links by, with the cover
 * first.
 *
 * The backend orders by `display_order`; the cover is pulled to the front here
 * because that is the one placement the publish checklist asks about, and a
 * Partner scanning the screen should not have to hunt for it.
 */
export function galleryOrder(items: readonly GalleryItem[]): readonly GalleryItem[] {
  return [...items].sort((a, b) => {
    if (a.link.isCover !== b.link.isCover) {
      return a.link.isCover ? -1 : 1;
    }
    return a.link.displayOrder - b.link.displayOrder;
  });
}

/** The cover of this gallery, if one has been chosen. */
export function coverOf(items: readonly GalleryItem[]): GalleryItem | null {
  return items.find((item) => item.link.isCover) ?? null;
}

/**
 * The `displayOrder` a newly attached asset should take.
 *
 * One past the highest in use, so an attachment never collides with an existing
 * placement and never has to renumber the ones already there.
 */
export function nextDisplayOrder(items: readonly GalleryItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.link.displayOrder + 1), 0);
}

/**
 * The largest file this console will attempt to upload.
 *
 * <h2>This is a client-side guard, and says so</h2>
 *
 * No frozen document sets a size limit and `RegisterMediaRequest.sizeBytes` is
 * only `@Positive`, so this is not a backend rule mirrored here — it is a fast
 * refusal in place of a slow one. A 60 MB original would otherwise be minted a
 * URL, pushed to R2 over a hotel's uplink, and only then be somebody's problem;
 * refusing it before the first byte leaves is the kinder failure.
 *
 * Generous on purpose: a full-frame JPEG straight off a camera is comfortably
 * inside it, which is what an operator actually has.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Why one picked file will not be uploaded. */
export type RejectionReason = 'type' | 'size' | 'empty';

export interface RejectedFile {
  readonly file: File;
  readonly reason: RejectionReason;
}

export interface UploadSelection {
  /** In the order the operator picked them; that becomes the gallery order. */
  readonly accepted: readonly File[];
  readonly rejected: readonly RejectedFile[];
}

/**
 * Splits a multi-file selection into what will be uploaded and what will not.
 *
 * <h2>Nothing is discarded silently</h2>
 *
 * Every rejected file comes back with the reason, so the screen can name it. A
 * picker that quietly drops the two files it did not like — out of the nine
 * somebody selected — is the version of this that loses a photograph without
 * anyone noticing.
 *
 * <h2>The type check is the backend's own list</h2>
 *
 * `MEDIA_MIME_TYPES` is exactly what `RegisterMediaRequest` accepts, so a file
 * refused here would have been refused there. This is not a second policy; it is
 * the same one, applied before the round trip. The authoritative check remains
 * the backend's magic-byte read of the stored object — a browser's `file.type`
 * is a guess from the extension and is trusted for nothing.
 */
export function selectUploads(files: readonly File[]): UploadSelection {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    if (file.size === 0) {
      rejected.push({ file, reason: 'empty' });
    } else if (!(MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
      rejected.push({ file, reason: 'type' });
    } else if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push({ file, reason: 'size' });
    } else {
      accepted.push(file);
    }
  }

  return { accepted, rejected };
}

const REJECTION_LABELS: Readonly<Record<RejectionReason, string>> = {
  type: 'định dạng không được hỗ trợ',
  size: `vượt quá ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`,
  empty: 'tệp rỗng',
};

export function rejectionLabel(reason: RejectionReason): string {
  return REJECTION_LABELS[reason];
}

/**
 * Mirrors `media.api.PublicMediaView` — one image on a guest-facing gallery.
 *
 * Deliberately narrow: a URL, its intrinsic size, its alt text and whether it
 * leads the gallery. No asset id, no category, no status, no storage key — a
 * guest needs the picture, not the record behind it.
 */
export interface PublicMediaView {
  readonly url: string;
  readonly width?: number | null;
  readonly height?: number | null;
  /** Partner-authored, per locale. Absent when none was written. */
  readonly alt?: string | null;
  readonly caption?: string | null;
  readonly isCover: boolean;
}
