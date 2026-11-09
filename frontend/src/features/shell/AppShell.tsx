'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { KasMark } from '@/features/auth/KasMark';
import { MenuIcon } from '@/ui/icons';
import { Badge } from '@/ui/primitives';
import styles from './AppShell.module.css';

/**
 * The shared operational shell — header, sidebar, main.
 *
 * One shell for both consoles. Admin and Partner differ in their navigation and
 * their header content, not in their chrome, so a second implementation would be
 * two things to keep in step for no benefit.
 *
 * <h2>Navigation never promises what does not exist</h2>
 *
 * A nav item is either backed by a real capability or explicitly marked
 * unavailable. Rendering a working-looking link to a screen with no backend is
 * how a shell starts lying about the product — so {@link NavItem.status} makes
 * that a decision the author has to write down.
 *
 * <h2>Responsive</h2>
 *
 * One component tree at every width (doc 82). The sidebar is a permanent column
 * on desktop and an overlay drawer below 1024px; nothing is duplicated for
 * mobile.
 */

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: ReactNode;
  /**
   * `available` — backed by a working endpoint.
   * `unavailable` — no backend contract; rendered disabled with a reason.
   */
  readonly status?: 'available' | 'unavailable';
  readonly reason?: string;
}

export interface NavSection {
  readonly heading?: string;
  readonly items: readonly NavItem[];
}

interface AppShellProps {
  readonly compact?: boolean;
  readonly wordmark: string;
  readonly sections: readonly NavSection[];
  /** Property switcher, environment chip, or anything else console-specific. */
  readonly headerSlot?: ReactNode;
  readonly accountSlot?: ReactNode;
  /**
   * Console-specific control directly under the brand, on the rail itself.
   *
   * Partner puts its hotel switcher here. Choosing which hotel you are working
   * on is navigation — it belongs with the navigation, not in a strip floating
   * above the page.
   */
  readonly railSlot?: ReactNode;
  /** The foot of the rail: sign out, below the navigation and separated from it. */
  readonly railFooterSlot?: ReactNode;
  readonly children: ReactNode;
}

/**
 * "KAS" in the display face, the qualifier beside it in gold.
 *
 * One string in, two spans out — callers still pass a single wordmark, and the
 * header and the sidebar cannot drift apart.
 */
function Wordmark({
  wordmark,
  inverse = false,
}: {
  readonly wordmark: string;
  /** True on the deep-green rail, where the primary half has to be light. */
  readonly inverse?: boolean;
}) {
  const [first, ...rest] = wordmark.split(' ');
  return (
    <span className={`${styles.wordmark} ${inverse ? styles.wordmarkInverse : ''}`}>
      {first}
      {rest.length > 0 ? (
        <span className={styles.wordmarkSuffix}>{rest.join(' ')}</span>
      ) : null}
    </span>
  );
}

export function AppShell({
  compact = false,
  wordmark,
  sections,
  headerSlot,
  accountSlot,
  railSlot,
  railFooterSlot,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = resolveActive(pathname, sections);

  /*
    With both header slots empty the bar holds only the drawer toggle and the
    mobile brand — neither of which exists above 1024, where the rail is
    permanent and carries the brand itself. So it would be a 64px empty strip
    with a rule under it, and the CSS removes it at that width.

    A console that still fills either slot keeps its header exactly as it was.
  */
  const barIsChromeOnly = headerSlot === undefined && accountSlot === undefined;

  return (
    <div className={`${styles.shell} ${compact ? styles.compact : ''}`} data-bar={barIsChromeOnly ? 'chrome-only' : undefined}>
      <a href="#main" className={styles.skipLink}>
        Bỏ qua điều hướng
      </a>

      <header className={styles.header}>
        <button
          type="button"
          className={styles.navToggle}
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          aria-label="Menu điều hướng"
        >
          <MenuIcon size={20} />
        </button>

        {/*
          The brand now lives at the top of the sidebar, where the reference puts
          it. This lockup is the mobile fallback: below 1024 the sidebar is a
          closed drawer, so without it the page would open with no brand at all.
        */}
        <span className={styles.headerBrand}>
          <Wordmark wordmark={wordmark} />
        </span>

        <div className={styles.headerSlot}>{headerSlot}</div>
        <div className={styles.accountSlot}>{accountSlot}</div>
      </header>

      <div className={styles.body}>
        <nav
          id="app-sidebar"
          className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ''}`}
          aria-label="Điều hướng chính"
        >
          {/*
            The brand at the head of the rail, on the deep-green field — the
            arrangement the reference dashboard uses. Hidden while the rail is a
            drawer, because the header is already carrying it there.
          */}
          <Link href="/" className={styles.sidebarBrand} onClick={() => setNavOpen(false)}>
            <KasMark size={32} />
            <Wordmark wordmark={wordmark} inverse />
          </Link>

          {railSlot === undefined ? null : (
            <div className={styles.railSlot}>{railSlot}</div>
          )}

          <div className={styles.navGroups}>
          {sections.map((section, index) => (
            <div key={section.heading ?? `section-${index}`} className={styles.navSection}>
              {section.heading === undefined ? null : (
                <h2 className={styles.navHeading}>{section.heading}</h2>
              )}
              <ul className={styles.navList}>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      activeHref={activeHref}
                      onNavigate={() => setNavOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </div>

          {/*
            Pushed to the foot of the rail and ruled off: reachable from every
            screen, and never mistaken for a navigation item.
          */}
          {railFooterSlot === undefined ? null : (
            <div className={styles.railFooter}>{railFooterSlot}</div>
          )}
        </nav>

        {navOpen ? (
          <button
            type="button"
            className={styles.scrim}
            aria-label="Đóng điều hướng"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The one navigation item that is current.
 *
 * <h2>Longest match wins</h2>
 *
 * Testing each item independently marked two of them active at once: an index
 * route is a prefix of everything beneath it, so `/admin` matched while the
 * reader was on `/admin/review`, and the sidebar highlighted both. Resolving
 * across the whole list instead, and keeping only the deepest href that matches,
 * gives exactly one current item — which is also what `aria-current="page"`
 * promises a screen reader.
 *
 * <p>A match is the href itself or a whole segment beneath it, never a string
 * prefix: `/partner` must not light up for `/partner-something`.
 */
function resolveActive(pathname: string, sections: readonly NavSection[]): string | null {
  let best: string | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      if (item.status === 'unavailable') {
        continue;
      }
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (best === null || item.href.length > best.length)) {
        best = item.href;
      }
    }
  }

  return best;
}

function NavLink({
  item,
  activeHref,
  onNavigate,
}: {
  readonly item: NavItem;
  /** The one href the shell resolved as current, or null. */
  readonly activeHref: string | null;
  readonly onNavigate: () => void;
}) {
  if (item.status === 'unavailable') {
    return (
      <span className={`${styles.navItem} ${styles.navDisabled}`} aria-disabled="true">
        <span className={styles.navLabel}>
          {item.icon}
          {item.label}
        </span>
        <Badge tone="neutral">{item.reason ?? 'Sắp có'}</Badge>
      </span>
    );
  }

  const active = item.href === activeHref;

  return (
    <Link
      href={item.href}
      className={`${styles.navItem} ${active ? styles.navActive : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      <span className={styles.navLabel}>
        {item.icon}
        {item.label}
      </span>
    </Link>
  );
}
