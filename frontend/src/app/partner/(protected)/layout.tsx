import type { ReactNode } from 'react';
import { messageFor } from '@/features/auth/messages';
import { SessionUnavailable } from '@/features/auth/SessionStates';
import { SessionKeepAlive } from '@/features/auth/SessionKeepAlive';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { PropertySwitcherControl } from '@/features/partner/PropertySwitcherControl';
import { propertyList } from '@/features/property/server';
import { propertyLabel } from '@/lib/domain/property';
import { AppShell } from '@/features/shell/AppShell';
import { consoleWordmark, navFor } from '@/features/shell/navigation';
import { requireSession } from '@/lib/auth/guard';
import { resolveConsole } from '@/lib/auth/session';
import { EmptyState, ToastProvider } from '@/ui/primitives';

/**
 * Everything under `/partner` except the sign-in page.
 *
 * The guard is in this nested group rather than `partner/layout.tsx` because a
 * guard on the parent would also guard `/partner/login`, redirecting an
 * anonymous visitor from the sign-in page to the sign-in page.
 *
 * Authentication only. What the session may actually *do* is decided by the
 * backend on every request — this guard cannot and does not check permissions.
 *
 * <h2>The property switcher</h2>
 *
 * The scoped list is loaded here, on the server, so the switcher is present on
 * every partner screen rather than only on the ones that happen to fetch
 * properties. `propertyList()` is request-memoised, so the properties page
 * rendering directly below shares this exact call instead of making a second
 * identical one.
 *
 * A failure is passed to the switcher as a message rather than thrown: a
 * property list that will not load is a broken switcher, not a broken console,
 * and taking down every partner page for it would be a worse answer than saying
 * so on the rail.
 *
 * <p>The switcher and sign-out sit on the navigation rail — `railSlot` and
 * `railFooterSlot` — rather than in the header bar. Choosing which hotel you
 * are working on is navigation, and once both moved the bar held nothing at
 * desktop width, so the shell drops it there. Admin still fills the header
 * slots and is unaffected.
 */
export default async function PartnerProtectedLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  /*
    Both reads start together, because neither needs the other.

    They used to run in sequence — the session probe, then the property list —
    so every Partner page load and every `router.refresh()` after a save paid
    two serial backend round trips before the page began rendering. The only
    coupling was the early return below, and awaiting the session first
    preserves it exactly: an `unavailable` session still renders the outage
    state, and an anonymous one still redirects out of `requireSession`.

    Starting the list early costs one discarded request in the signed-out
    case. `loadPropertyList` resolves its own failures into a result union
    rather than rejecting, so nothing is left to become an unhandled rejection
    when the redirect throws past it.
  */
  // One sign-in page for the whole console (2026-11-10): /admin/login.
  const sessionRead = requireSession({ signInPath: '/admin/login', returnTo: '/partner' });

  const session = await sessionRead;

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

  // Only Admin works hotel by hotel; Super Admin does not hold `property.manage`.
  const list = consoleRole === 'SUPER_ADMIN' ? null : await propertyList();

  return (
    <ToastProvider>
      <SessionKeepAlive />
      <AppShell
        wordmark={consoleWordmark(consoleRole)}
        sections={navFor(consoleRole)}
        // The same fixed rail as /admin: Super Admin's menu moves between /partner
        // and /admin routes, and the shell must not change size or position when it does.
        compact
        railSlot={list === null ? undefined : (
          <PropertySwitcherControl
            properties={
              list.status === 'ok'
                ? // The name where the Partner has written one, the slug where
                  // they have not — never a name derived from the slug.
                  list.properties.map((property) => ({
                    id: property.id,
                    label: propertyLabel(property.names),
                  }))
                : []
            }
            error={list.status === 'error' ? messageFor(list.error) : undefined}
          />
        )}
        railFooterSlot={<SignOutButton redirectTo="/admin/login" />}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
