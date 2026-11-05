import type { ReactNode } from 'react';
import { SessionUnavailable } from '@/features/auth/SessionStates';
import { SessionKeepAlive } from '@/features/auth/SessionKeepAlive';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { AppShell } from '@/features/shell/AppShell';
import { consoleWordmark, navFor } from '@/features/shell/navigation';
import { requireSession } from '@/lib/auth/guard';
import { resolveConsole } from '@/lib/auth/session';
import { EmptyState, ToastProvider } from '@/ui/primitives';

/**
 * Everything under `/admin` except the sign-in page.
 *
 * Requests without a valid session redirect to `/admin/login`. ADMIN and
 * SUPER_ADMIN sign in the same way and see their own console; access remains
 * guarded by the session, role permissions and scope checks.
 */
export default async function AdminProtectedLayout({ children }: { readonly children: ReactNode }) {
  const session = await requireSession({ signInPath: '/admin/login', returnTo: '/admin' });

  if (session.status === 'unavailable') {
    return (
      <main style={{ padding: 'var(--density-page-padding)' }}>
        <SessionUnavailable correlationId={session.correlationId} />
      </main>
    );
  }

  const consoleRole = await resolveConsole();

  // The role could not be read (backend unreachable or an unexpected answer).
  // Showing a console menu without a confirmed role would present screens the
  // account may not have; say so instead. The backend still guards every call.
  if (consoleRole === null) {
    return (
      <main style={{ padding: 'var(--density-page-padding)' }}>
        <EmptyState title="Chưa xác định được quyền truy cập">
          Không đọc được quyền của tài khoản lúc này. Hãy tải lại trang hoặc đăng nhập lại.
        </EmptyState>
        <SignOutButton redirectTo="/admin/login" />
      </main>
    );
  }

  if (consoleRole === 'NONE') {
    return (
      <main style={{ padding: 'var(--density-page-padding)' }}>
        <EmptyState title="Tài khoản này không có quyền quản trị">
          Hãy đăng xuất và đăng nhập bằng tài khoản Admin hoặc Super Admin.
        </EmptyState>
        <SignOutButton redirectTo="/admin/login" />
      </main>
    );
  }

  return (
    <ToastProvider>
      <SessionKeepAlive />
      <AppShell
        wordmark={consoleWordmark(consoleRole)}
        sections={navFor(consoleRole)}
        compact
        railFooterSlot={<SignOutButton redirectTo="/admin/login" />}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
