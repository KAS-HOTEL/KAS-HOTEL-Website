import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveConsole, resolveSession, type SessionState } from './session';

/**
 * Server-side route guards.
 *
 * <h2>These are navigation, not authorisation</h2>
 *
 * Doc 59 §7.1 is deny-by-default and the backend enforces every permission and
 * every scope inside its own SQL. A guard here exists so a signed-out visitor
 * sees a sign-in page instead of a screen full of error states — nothing more.
 *
 * Nothing in this module reads a role, a claim or a flag from the client. The
 * session cookies are `HttpOnly`, and the frontend learns one thing from the
 * server: which console to draw. Every individual action is authorised by the
 * backend when it is attempted.
 *
 * That is deliberate. A frontend that carried a permission set would eventually
 * be trusted for one, and the first bug in it would be a security bug.
 */

export interface GuardOptions {
  /** Where to send an anonymous caller. */
  readonly signInPath: string;
  /** The path to return to after signing in. */
  readonly returnTo: string;
}

/**
 * Requires an authenticated session, or redirects to sign-in.
 *
 * A backend outage is <strong>not</strong> treated as signed-out: the caller
 * receives {@code unavailable} and the page renders an outage state. Redirecting
 * would tell the user they had been logged out, which is false, and would
 * discard a session that is still valid.
 */
export async function requireSession(options: GuardOptions): Promise<SessionState> {
  const session = await resolveSession();

  if (session.status === 'anonymous') {
    // Back to the page that was asked for when the proxy passed it on, so a
    // silently renewed session continues where the user was.
    const requested = safeReturnTo((await headers()).get('x-kas-path') ?? undefined, options.returnTo);
    const returnTo = requested.startsWith(options.signInPath) ? options.returnTo : requested;
    const target = `${options.signInPath}?returnTo=${encodeURIComponent(returnTo)}`;
    redirect(target);
  }
  return session;
}

/** Sends the other role to its own overview instead of a screen whose reads would be refused. */
export async function requireConsole(expected: 'ADMIN' | 'SUPER_ADMIN'): Promise<void> {
  const role = await resolveConsole();
  if (role === 'ADMIN' && expected === 'SUPER_ADMIN') redirect('/admin');
  if (role === 'SUPER_ADMIN' && expected === 'ADMIN') redirect('/partner');
}

/** Sends an already-authenticated caller away from a sign-in page. */
export async function redirectIfAuthenticated(destination: string): Promise<void> {
  const session = await resolveSession();
  if (session.status === 'authenticated') {
    redirect(destination);
  }
}

/**
 * A `returnTo` value that cannot leave this origin.
 *
 * An open redirect is the classic sign-in bug: `?returnTo=https://evil.example`
 * turns the login page into a credential-harvesting hop. Only same-origin
 * absolute paths are accepted, and `//host` is rejected because the browser
 * reads it as protocol-relative.
 */
export function safeReturnTo(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  return value;
}
