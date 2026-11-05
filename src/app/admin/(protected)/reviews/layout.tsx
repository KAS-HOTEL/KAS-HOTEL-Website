import type { ReactNode } from 'react';
import { requireConsole } from '@/lib/auth/guard';

/** ADMIN only: `RoleCatalogue` gives these screens to one role (`ConsoleRoleIT`). */
export default async function ConsoleOnlyLayout({ children }: { readonly children: ReactNode }) {
  await requireConsole('ADMIN');
  return children;
}
