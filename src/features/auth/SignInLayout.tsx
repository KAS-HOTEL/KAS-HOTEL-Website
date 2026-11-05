import type { ReactNode } from 'react';
import styles from './SignInLayout.module.css';

/**
 * The shared sign-in shell for both consoles.
 *
 * <h2>Two panels, and why the left one is typography</h2>
 *
 * Doc 80 §1 gives the management surfaces the text face and a functional
 * layout, and doc 74 shares colour, type and radius across both experiences. So
 * the brand panel is built from those tokens rather than from a photograph:
 * there is no hero image in the repository to use, generating one is out of
 * bounds, and a stock hotel picture would be somebody else's hospitality rather
 * than KAS's.
 *
 * <p>What it does carry is the one thing a partner portal should say at the
 * door — whose product this is and what it is for — set in the display serif at
 * a size the operational density never uses elsewhere. That is the whole
 * decoration budget.
 *
 * <h2>It collapses rather than shrinks</h2>
 *
 * Below the tablet breakpoint the panel is not scaled down; it is dropped, and
 * the wordmark moves above the card. A 375px screen gets a form, not a
 * miniature of a desktop page.
 */
export function SignInLayout({
  title,
  subtitle,
  children,
  notice,
  /** One line under the brand statement. Operational, never marketing. */
  tagline,
  /**
   * A short editorial line at the foot of the brand panel, set off by a gold
   * rule. Present in the target design; optional here because the recovery
   * screens are narrower in purpose and do not carry it.
   */
  quote,
  /** Links below the card — sign-in alternatives, account routes. */
  footer,
  /**
   * True when the page renders its own {@code h1} inside {@code children}.
   *
   * The wordmark above the card is then a paragraph rather than a heading, so a
   * screen reader still finds exactly one top-level heading per page and it is
   * the one describing what the page is for — not the product's name, which is
   * on every screen.
   */
  headingInChildren = false,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly notice?: ReactNode;
  readonly tagline?: string;
  readonly quote?: string;
  readonly footer?: ReactNode;
  readonly headingInChildren?: boolean;
}) {
  return (
    <main className={styles.page} data-density="operational">
      <section className={styles.brand} aria-hidden="true">
        <p className={styles.brandMark}>{title}</p>
        <p className={styles.brandStatement}>
          Quản lý khách sạn của bạn trên một nền tảng duy nhất.
        </p>
        {tagline ? <p className={styles.brandTagline}>{tagline}</p> : null}
        {quote ? (
          <p className={styles.brandQuote}>
            <span className={styles.brandRule} />
            {quote}
          </p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          {/* The wordmark is the accessible one: the brand panel is decorative. */}
          {headingInChildren ? (
            <p className={styles.wordmark}>{title}</p>
          ) : (
            <h1 className={styles.wordmark}>{title}</h1>
          )}
          <p className={styles.subtitle}>{subtitle}</p>
          {children}
          {footer ? <div className={styles.footer}>{footer}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}
        </div>
      </section>
    </main>
  );
}
