'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { Button } from '@/ui/primitives';
import { invalidateSessionCache } from './actions';

/**
 * Signs out through the backend.
 *
 * <h2>Why the request matters</h2>
 *
 * Clearing local state alone would leave the session <em>alive</em> on the
 * server — doc 90 records revocation as genuine and server-side, and the
 * refresh token would still be usable. `POST /logout` revokes the session and
 * returns cleared cookies; only then is the user actually signed out.
 *
 * A 401 from logout is success in every way that matters: the session is
 * already gone. Verified against the running backend — logging out without a
 * session returns `401 UNAUTHENTICATED`. Showing an error there would be
 * alarming and wrong, so it is treated as done.
 */
export function SignOutButton({ redirectTo }: { readonly redirectTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await authApi.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.isUnauthenticated)) {
        // Anything else — a network failure, a 5xx — means the server may still
        // hold the session. Stop rather than navigate away implying success.
        setBusy(false);
        return;
      }
    }
    await invalidateSessionCache();
    router.replace(redirectTo);
  }

  return (
    <Button variant="secondary" onClick={signOut} disabled={busy}>
      {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
    </Button>
  );
}
