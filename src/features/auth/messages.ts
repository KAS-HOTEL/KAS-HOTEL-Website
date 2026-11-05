import type { ApiError } from '@/lib/api/errors';

/**
 * User-facing messages for the doc 58 §2.1 error codes.
 *
 * Vietnamese first, matching the owner's specified wording. Doc 25 makes
 * Vietnamese and English the two frozen locales; a real i18n layer arrives with
 * the customer experience, and this module is the seam it will replace.
 *
 * No message here ever carries a backend message for a 5xx: `GlobalExceptionHandler`
 * already replaces those with a constant precisely so SQL, class names and paths
 * cannot reach a user, and passing `error.message` through for a 500 would
 * defeat that.
 */
export const AUTH_MESSAGES = {
  expired: 'Phiên đăng nhập đã hết hạn.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  notFound: 'Không tìm thấy tài nguyên.',
  conflict: 'Thông tin đã thay đổi. Vui lòng tải lại và thử lại.',
  unavailable: 'Không thể kết nối tới hệ thống. Vui lòng thử lại.',
  invalidCredentials: 'Email hoặc mật khẩu không đúng.',
} as const;

/**
 * Maps a failed call to a message.
 *
 * `422` is the one case that shows the backend's own text: those messages are
 * authored for the caller and are safe by construction (see `KasException`), and
 * replacing them with something generic would discard the actionable part —
 * "this change would oversell 3 dates" is the whole point.
 */
export function messageFor(error: ApiError): string {
  if (error.isUnauthenticated) {
    return AUTH_MESSAGES.expired;
  }
  if (error.isForbidden) {
    return AUTH_MESSAGES.forbidden;
  }
  if (error.isNotFound) {
    return AUTH_MESSAGES.notFound;
  }
  if (error.isConflict) {
    return AUTH_MESSAGES.conflict;
  }
  if (error.isUnprocessable || error.status === 400) {
    return error.message;
  }
  return AUTH_MESSAGES.unavailable;
}

/**
 * The message for a failed sign-in.
 *
 * A 401 from `/login` means the credentials were rejected, not that a session
 * expired — so it gets its own wording rather than "your session has ended",
 * which would be nonsense on a sign-in page.
 *
 * The backend deliberately returns one generic refusal for a wrong password,
 * an unknown account or a locked account. That is account-enumeration
 * resistance, and the frontend must not try to guess which it was.
 */
export function signInMessageFor(error: ApiError): string {
  if (error.isUnauthenticated) {
    return AUTH_MESSAGES.invalidCredentials;
  }
  return messageFor(error);
}
