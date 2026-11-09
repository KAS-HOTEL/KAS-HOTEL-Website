import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

/**
 * The one page header for every console screen: optional eyebrow, the page's
 * h1, a short description and, on the right, the page's own actions.
 *
 * Screens used to style their own headings — 24px here, 30px there, a 54px
 * display title on another — so moving between "Khách sạn" and "Nội dung
 * website" changed the type scale each time. This keeps one scale, one rhythm.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {eyebrow === undefined ? null : <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
        {description === undefined ? null : <div className={styles.description}>{description}</div>}
      </div>
      {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
