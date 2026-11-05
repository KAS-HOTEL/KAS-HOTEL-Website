import type { ReactNode } from 'react';

/**
 * Partner portal shell — the hotel operator.
 *
 * A <strong>frontend information-architecture</strong> decision only (OQ-129,
 * approved 2026-08-18). It creates no `PARTNER` role, no partner permission and
 * no partner API namespace: the backend model is unchanged — the `ADMIN` role
 * carrying `PARTNER` scope, exactly as doc 59 §2 and doc 85 §5.1 define it.
 *
 * Every request this tree makes goes to the existing `/api/v1/admin/**`
 * contract, and the backend's scope filter decides what comes back.
 */
export default function PartnerLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div data-density="operational" style={{ minHeight: '100vh' }}>
      {children}
    </div>
  );
}
