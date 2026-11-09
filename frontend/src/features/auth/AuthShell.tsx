import type { ReactNode } from 'react';
import { KasMark } from './KasMark';
import styles from './AuthShell.module.css';

/**
 * The chrome every partner authentication screen sits in.
 *
 * <h2>Three things the old layout got wrong</h2>
 *
 * The card was undersized — a 460px ceiling inside a 46% column left a
 * registration form floating in a third of a 1440px screen. The brand panel and
 * the form were the same visual weight, so neither led. And the recovery screens
 * looked like a different product from the sign-in they belong to.
 *
 * <p>So: the card is sized by what it holds (`width`), the brand panel is a
 * composed editorial column rather than a coloured rectangle, and all five
 * screens share this one shell — including the brand bar across the top, which
 * is what makes them read as one product.
 *
 * <h2>Two column shapes, both from this file</h2>
 *
 * A `split` screen puts the editorial panel beside the form: sign-in and
 * registration, where the reader is arriving and the product should introduce
 * itself. A `focused` screen drops the panel and centres a narrow card under a
 * medallion: password recovery, where the reader is mid-task and a marketing
 * column would be noise. The reference designs make the same split.
 *
 * <h2>Below 1024 there is no panel at all</h2>
 *
 * Not scaled down — removed. The brand survives as the bar at the top, and the
 * card becomes the page. A phone gets a form, not a miniature of a desktop.
 */
export function AuthShell({
  variant = 'split',
  width = 'regular',
  eyebrow,
  headline,
  supporting,
  quote,
  medallion,
  children,
}: {
  /** `split` shows the editorial panel from 1024 up; `focused` never does. */
  readonly variant?: 'split' | 'focused';
  /**
   * `wide` is for the registration form, which carries a stepper and four
   * fields at once. It also raises the breakpoint at which the editorial panel
   * appears: a wide card in a 54% column at 1024px is narrower than the same
   * card with no panel at 768px, so the split would make the form worse rather
   * than better. It waits for 1280.
   */
  readonly width?: 'regular' | 'wide';
  /** Small gold line above the headline. */
  readonly eyebrow?: string;
  /** The editorial headline on the brand panel. Ignored when `focused`. */
  readonly headline?: ReactNode;
  readonly supporting?: string;
  /** The closing line, set off by a gold rule. */
  readonly quote?: string;
  /** The icon a focused screen leads with, in its own soft medallion. */
  readonly medallion?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.page} data-variant={variant} data-width={width}>
      <header className={styles.bar}>
        <span className={styles.brandLockup}>
          <KasMark />
          <span className={styles.wordmark}>
            KAS <span className={styles.wordmarkSuffix}>Partner</span>
          </span>
        </span>
      </header>

      <main className={styles.body}>
        {variant === 'split' ? (
          <section className={styles.panel} aria-hidden="true">
            <div className={styles.panelInner}>
              {eyebrow ? <p className={styles.panelEyebrow}>{eyebrow}</p> : null}
              {headline ? <p className={styles.panelHeadline}>{headline}</p> : null}
              {supporting ? <p className={styles.panelSupporting}>{supporting}</p> : null}
              {quote ? (
                <p className={styles.panelQuote}>
                  <span className={styles.panelRule} />
                  {quote}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={styles.stage}>
          <div className={styles.card} data-width={width}>
            {medallion ? (
              <span className={styles.medallion} aria-hidden="true">
                {medallion}
              </span>
            ) : null}
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * The heading block every card opens with.
 *
 * Extracted so the five screens cannot drift apart in type scale — which is
 * exactly how the recovery pages ended up looking like a different product.
 */
export function AuthHeading({
  title,
  children,
}: {
  readonly title: string;
  /** The supporting sentence under the title. */
  readonly children?: ReactNode;
}) {
  return (
    <div className={styles.head}>
      <h1 className={styles.title}>{title}</h1>
      {children ? <p className={styles.subtitle}>{children}</p> : null}
    </div>
  );
}

/** The links that close a card, above a hairline rule. */
export function AuthFooter({
  split = false,
  children,
}: {
  /** True puts one link at each end of the row. */
  readonly split?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={`${styles.foot} ${split ? styles.footSplit : ''}`}>{children}</div>
  );
}
