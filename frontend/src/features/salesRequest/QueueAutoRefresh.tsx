'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-reads the queue from the server every `intervalMs` while the tab is visible,
 * and once when it becomes visible again. `router.refresh()` keeps the URL — so
 * the tab, hotel, search, order and page all stay as they were — and keeps the
 * text typed into the search box.
 */
export function QueueAutoRefresh({ intervalMs = 60_000 }: { readonly intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, intervalMs]);
  return null;
}
