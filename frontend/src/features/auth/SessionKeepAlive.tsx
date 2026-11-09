'use client';

import { useEffect } from 'react';
import { authApi } from '@/lib/api/endpoints';
import { refreshOnce } from '@/lib/api/refresh';

/** Renew a little before the 15-minute access token runs out. */
export const KEEP_ALIVE_MS = 10 * 60_000;

/**
 * Keeps a console session alive while someone is using it.
 *
 * The access cookie lives 15 minutes and pages render on the server, which
 * cannot rotate cookies — so an operator who navigated after 15 quiet minutes
 * used to be sent to the sign-in page although their refresh token (12 h for
 * staff) was still valid. This renews in the browser every 10 minutes while the
 * tab is visible, and straight away when a tab that slept comes back.
 *
 * It never signs anyone out: a failed renewal (network, another tab rotating at
 * the same moment) is left alone, and the next server render decides. It uses
 * the shared single-flight refresh, so it never races the API client's own.
 */
export function SessionKeepAlive({ intervalMs = KEEP_ALIVE_MS }: { readonly intervalMs?: number }) {
  useEffect(() => {
    let last = Date.now();
    const renew = () => {
      last = Date.now();
      void refreshOnce(() => authApi.refresh());
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') renew();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= intervalMs) renew();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return null;
}
