import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@/config/env';
import { searchCopy } from '@/features/hotel/requestMessages';
import styles from './CustomerShell.module.css';

/**
 * The customer-facing shell.
 *
 * <h2>Visually separate from the consoles, by construction</h2>
 *
 * No `data-density="operational"` attribute, so it keeps the editorial defaults
 * `tokens.css` declares on `:root` — 44px controls, `space-5` rhythm, and the
 * display face available for headlines. Doc 80 §1 sets exactly this split:
 * shared colour, type family, radius and shadow; different density, type scale,
 * motion and imagery.
 *
 * <h2>Mobile-first</h2>
 *
 * The layout starts as a single column and gains width at breakpoints, rather
 * than a desktop grid being squeezed down. One component tree throughout
 * (doc 82) — there is no separate mobile header.
 *
 * <h2>What is deliberately absent</h2>
 *
 * Account navigation leads to the authenticated customer stays surface; the
 * backend remains the authority for ownership and every cancellation decision.
 */
export function CustomerShell({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>

      <header className={styles.header}>
        <Link href={`/${locale}`} className={styles.wordmark}>
          KAS
        </Link>
        <nav aria-label="Chính" className={styles.nav}>
          <Link href={`/${locale}/hotels`} className={styles.navLink}>
            {searchCopy(locale).hotelsNav}
          </Link>
          <Link href={`/${locale}/guidebook`} className={styles.navLink}>
            {locale === 'vi' ? 'Cẩm nang Sài Gòn' : 'Saigon guidebook'}
          </Link>
          <Link href={`/${locale}/account/stays`} className={styles.navLink}>
            {locale === 'vi' ? 'Lưu trú của tôi' : 'My stays'}
          </Link>
        </nav>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <footer className={styles.footer}>
        <p className={styles.footerText}>
          KAS — {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
