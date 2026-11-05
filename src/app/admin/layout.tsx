import type { ReactNode } from 'react';

/**
 * Admin console shell — the KAS platform operator.
 *
 * `data-density="operational"` switches the shared token system to doc 80 §1's
 * management rhythm. Nothing else about the design system changes.
 *
 * The platform operator is `SUPER_ADMIN` with `GLOBAL` scope (doc 85 §5.2).
 * Sign-in uses the normal email-and-password authentication flow; 2FA is not
 * required by the current owner-approved policy (doc 150).
 */
export default function AdminLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div data-density="operational" style={{ minHeight: '100vh' }}>
      {children}
    </div>
  );
}
