import type { ReactNode } from 'react';
import { requireConsole } from '@/lib/auth/guard';

/** ADMIN only: every "Nội dung website" screen (`RoleCatalogue` gives content to ADMIN, `ConsoleRoleIT`). */
export default async function ConsoleOnlyLayout({ children }: { readonly children: ReactNode }) {
  await requireConsole('ADMIN');
  return children;
}
