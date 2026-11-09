import type { ReactNode } from 'react';
import { requireConsole } from '@/lib/auth/guard';

/** SUPER_ADMIN only: guest reviews moved from ADMIN to SUPER_ADMIN (2026-11-08, `ConsoleRoleIT`). */
export default async function ConsoleOnlyLayout({ children }: { readonly children: ReactNode }) {
  await requireConsole('SUPER_ADMIN');
  return children;
}
