import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isSupportedLocale } from '@/config/env';
import { CustomerShell } from '@/features/shell/CustomerShell';

/**
 * Customer experience shell.
 *
 * Locale-prefixed per doc 22 §3 — every customer route carries `/vi` or `/en`.
 * The management consoles deliberately do not (doc 22 §8: one language in V1,
 * OQ-057), which is why they are separate route groups rather than nested here.
 *
 * No `data-density` attribute: the customer tree uses the editorial default that
 * `tokens.css` declares on `:root`.
 */
export default async function CustomerLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  return (
    <div lang={locale}>
      <CustomerShell locale={locale}>{children}</CustomerShell>
    </div>
  );
}
