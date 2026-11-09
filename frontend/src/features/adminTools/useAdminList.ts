'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { messageFor } from '@/features/auth/messages';

export function adminError(caught: unknown): string {
  return caught instanceof ApiError ? messageFor(caught) : 'Không thể kết nối. Vui lòng thử lại.';
}

export function useAdminList<T>(loader: () => Promise<T[]>) {
  const [state, setState] = useState<{ source: typeof loader | null; rows: T[]; error: string; loading: boolean }>({ source: null, rows: [], error: '', loading: true });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState((current) => ({ ...current, source: loader, loading: true, error: '' }));
    try { const rows = await loader(); if (generation.current === request) setState({ source: loader, rows, error: '', loading: false }); }
    catch (caught) { if (generation.current === request) setState((current) => ({ ...current, source: loader, error: adminError(caught), loading: false })); }
  }, [loader]);
  useEffect(() => {
    let active = true;
    const request = ++generation.current;
    void loader().then((rows) => {
      if (active && generation.current === request) setState({ source: loader, rows, error: '', loading: false });
    }).catch((caught: unknown) => {
      if (active && generation.current === request) setState({ source: loader, rows: [], error: adminError(caught), loading: false });
    });
    return () => { active = false; };
  }, [loader]);
  const setError = (error: string) => setState((current) => ({ ...current, error }));
  return { rows: state.rows, loading: state.source !== loader || state.loading, error: state.source === loader ? state.error : '', setError, reload };
}
