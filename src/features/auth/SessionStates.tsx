import { EmptyState, ErrorState } from '@/ui/primitives';
import { Skeleton } from '@/ui/primitives';
import { AUTH_MESSAGES } from './messages';
import type { ApiError } from '@/lib/api/errors';

/**
 * The session-boundary states, so every guarded screen renders the same thing.
 */

export function SessionLoading() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }} aria-busy="true">
      <Skeleton height={28} width="40%" />
      <Skeleton height={16} />
      <Skeleton height={16} width="80%" />
    </div>
  );
}

/**
 * The backend could not be reached.
 *
 * Distinct from signed-out on purpose: a visitor whose session is fine should
 * not be told they were logged out because the API was briefly down.
 */
export function SessionUnavailable({ correlationId }: { readonly correlationId: string | null }) {
  return (
    <EmptyState title="Hệ thống tạm thời không phản hồi">
      {AUTH_MESSAGES.unavailable}
      {correlationId ? ` (Mã tham chiếu: ${correlationId})` : ''}
    </EmptyState>
  );
}

export function PermissionDenied() {
  return <EmptyState title="Không có quyền truy cập">{AUTH_MESSAGES.forbidden}</EmptyState>;
}

/**
 * Not found — including "outside your scope".
 *
 * Doc 85 §6.3 returns 404 for another partner's records so their existence is
 * never disclosed. This wording is identical in both cases by design, and must
 * never be softened into a permission message.
 */
export function NotFoundState() {
  return <EmptyState title="Không tìm thấy">{AUTH_MESSAGES.notFound}</EmptyState>;
}

export function AuthenticationError({ error }: { readonly error: ApiError }) {
  return <ErrorState error={error} />;
}
