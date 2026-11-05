'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a session change.
 *
 * <h2>Why sign-in itself is not a Server Action</h2>
 *
 * Login must land the backend's `Set-Cookie` headers in the browser with their
 * exact flags — `HttpOnly`, `Secure`, `SameSite=Lax`, and the refresh cookie's
 * `Path=/api/v1/public/auth`. Posting from a Server Action would mean the Next
 * server received those headers and had to re-issue them, parsing and rebuilding
 * every attribute. Getting one wrong — a lost `Path`, a widened `SameSite` —
 * would weaken the session silently.
 *
 * So the browser posts to `/api/v1/public/auth/login` through the proxy and the
 * cookies arrive untouched. This action only tells Next that server-rendered
 * pages must be re-fetched now that the session changed.
 */
export async function invalidateSessionCache(): Promise<void> {
  revalidatePath('/', 'layout');
}
