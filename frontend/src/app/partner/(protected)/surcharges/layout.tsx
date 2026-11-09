import type { ReactNode } from 'react';
import { requireConsole } from '@/lib/auth/guard';

/** SUPER_ADMIN only: surcharges are managed by SUPER_ADMIN (2026-11-08). */
export default async function SurchargesLayout({ children }: { readonly children: ReactNode }) {
  await requireConsole('SUPER_ADMIN');
  return children;
}
