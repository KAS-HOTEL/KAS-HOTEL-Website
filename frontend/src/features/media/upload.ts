import { mediaApi } from '@/lib/api/endpoints';
import { uploadToStorage, type StorageUploadError } from '@/lib/api/endpoints/media';
import { MEDIA_MIME_TYPES, type MediaCategory, type MediaMimeType } from '@/lib/domain/media';

/**
 * What the image uploaders share: the allowlisted types, the image's own size, the
 * storage-failure message, and an upload with no owner for website images.
 */

/** The allowlist the backend enforces, checked here so a refusal is immediate. */
export function isSupportedImage(mimeType: string): mimeType is MediaMimeType {
  return (MEDIA_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * The image's own pixel dimensions, when the browser will say. Optional metadata: any
 * failure returns nothing rather than guessing, and never stops an upload.
 */
export async function intrinsicSize(file: File): Promise<{ width?: number; height?: number }> {
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

/**
 * What to tell the operator when the direct upload to storage fails. No status means the
 * browser never completed the request (almost always the bucket's CORS rule); a status
 * means storage refused it (an expired URL, a file too large) and retrying usually works.
 */
export function storageMessage(error: StorageUploadError): string {
  if (error.status === null) {
    return 'Không gửi được ảnh tới kho lưu trữ. Kho lưu trữ chưa cho phép tải lên từ địa chỉ '
      + 'này — cần cấu hình CORS cho bucket. Hãy báo cho quản trị hệ thống.';
  }
  return `Kho lưu trữ từ chối tệp (HTTP ${error.status}). Liên kết tải lên có thể đã hết hạn — `
    + 'hãy thử tải lên lại.';
}

/** Thrown when the deployment stores images but has no public delivery address for them. */
export class NoDeliveryUrlError extends Error {
  constructor() {
    super('Ảnh đã tải lên nhưng hệ thống chưa cấu hình đường dẫn hiển thị ảnh (KAS_MEDIA_DELIVERY_BASE_URL).');
  }
}

/**
 * Uploads one website image (homepage, page heroes, Guidebook) to the KAS image store and
 * returns its public address, which the image slot then points at. Doc 62 §4: mint a URL,
 * PUT the bytes straight to storage, confirm. The asset is not attached to a hotel or room.
 */
export async function uploadWebsiteImage(file: File, category: MediaCategory = 'DETAIL'): Promise<string> {
  if (!isSupportedImage(file.type)) {
    throw new TypeError('Định dạng ảnh không được hỗ trợ. Hãy dùng JPEG, PNG, WebP hoặc AVIF.');
  }
  const minted = await mediaApi.uploadUrl({ mimeType: file.type, category, ...(await intrinsicSize(file)) });
  await uploadToStorage(minted.uploadUrl, file);
  const asset = await mediaApi.complete(minted.mediaAssetId);
  if (asset.url === null) {
    throw new NoDeliveryUrlError();
  }
  return asset.url;
}
