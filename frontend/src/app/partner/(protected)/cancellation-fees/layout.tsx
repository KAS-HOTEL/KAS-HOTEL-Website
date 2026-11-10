import type { ReactNode } from 'react';
import { requireConsole } from '@/lib/auth/guard';

/** SUPER_ADMIN only: cancellation fees belong to room prices, managed by SUPER_ADMIN. */
export default async function CancellationFeesLayout({ children }: { readonly children: ReactNode }) {
  await requireConsole('SUPER_ADMIN');
  return children;
}
