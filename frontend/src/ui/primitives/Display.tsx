'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from '../icons';
import styles from './Display.module.css';

/**
 * Card, Badge, Tabs and Breadcrumb — the layout and status primitives.
 *
 * Grouped because they are small, share one stylesheet, and are always used
 * together to frame a page.
 */

export function Card({
  title,
  actions,
  children,
  as: Element = 'section',
}: {
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly as?: 'section' | 'article' | 'div';
}) {
  return (
    <Element className={styles.card}>
      {title === undefined && actions === undefined ? null : (
        <header className={styles.cardHeader}>
          {title === undefined ? null : <h2 className={styles.cardTitle}>{title}</h2>}
          {actions === undefined ? null : <div className={styles.cardActions}>{actions}</div>}
        </header>
      )}
      <div className={styles.cardBody}>{children}</div>
    </Element>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

/**
 * A status chip.
 *
 * The text is the signal; the tint corroborates it. Doc 82 forbids conveying
 * state by colour alone, so a badge always reads correctly in greyscale — which
 * is also why there is no icon-only variant.
 */
export function Badge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly disabled?: boolean;
}

/**
 * Navigation tabs, backed by real links.
 *
 * Links, not buttons with client state: each tab is a route, so it must be
 * openable in a new tab, bookmarkable and restorable on reload. `aria-current`
 * marks the active one for assistive technology rather than styling alone.
 */
export function Tabs({
  label,
  items,
  activeId,
}: {
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly activeId: string;
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      <ul className={styles.tabList}>
        {items.map((item) => {
          const active = item.id === activeId;
          if (item.disabled === true) {
            return (
              <li key={item.id}>
                <span className={`${styles.tab} ${styles.tabDisabled}`} aria-disabled="true">
                  {item.label}
                </span>
              </li>
            );
          }
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface Crumb {
  readonly label: string;
  /** Omitted on the final crumb, which is the current page. */
  readonly href?: string;
}

export function Breadcrumb({ items }: { readonly items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.crumbList}>
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <li key={crumb.label} className={styles.crumb}>
              {crumb.href !== undefined && !last ? (
                <Link href={crumb.href}>{crumb.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
              )}
              {last ? null : <ChevronRightIcon size={14} className={styles.crumbSeparator} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
