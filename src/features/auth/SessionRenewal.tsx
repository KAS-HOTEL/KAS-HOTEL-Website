'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { authApi } from '@/lib/api/endpoints';
import { refreshOnce } from '@/lib/api/refresh';
import styles from './SignInForm.module.css';

/**
 * Wraps the sign-in form on pages a protected screen redirected to.
 *
 * Being sent here with `returnTo` usually means only the 15-minute access
 * cookie expired; the refresh cookie (scoped to /api/v1/public/auth, so a
 * server render never sees it) may still be valid. Try one silent renewal
 * first: if it works, go straight back to where the user was; if not, show the
 * form with a plain "your session has ended" note.
 */
/**
 * When the last silent renewal happened in this tab. If a renewed session is
 * still refused (a cookie the browser would not store, say), the protected page
 * sends us straight back here; this stops that from becoming a loop.
 */
let lastRenewalAt = 0;
const RENEWAL_COOLDOWN_MS = 15_000;

export function SessionRenewal({
  returnTo,
  attempt,
  children,
}: {
  readonly returnTo: string;
  /** Only when a protected page sent the user here. */
  readonly attempt: boolean;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<'renewing' | 'expired' | 'idle'>(attempt ? 'renewing' : 'idle');

  useEffect(() => {
    if (!attempt) return;
    let cancelled = false;
    if (Date.now() - lastRenewalAt < RENEWAL_COOLDOWN_MS) {
      queueMicrotask(() => {
        if (!cancelled) setState('expired');
      });
      return () => {
        cancelled = true;
      };
    }
    void refreshOnce(() => authApi.refresh()).then((renewed) => {
      if (cancelled) return;
      if (renewed) {
        lastRenewalAt = Date.now();
        router.replace(returnTo);
        router.refresh();
      } else {
        setState('expired');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, returnTo, router]);

  if (state === 'renewing') {
    return (
      <p className={styles.renewing} role="status" aria-live="polite">
        Đang khôi phục phiên đăng nhập…
      </p>
    );
  }
  return (
    <>
      {state === 'expired' ? (
        <p className={styles.sessionNotice} role="status">
          Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.
        </p>
      ) : null}
      {children}
    </>
  );
}
