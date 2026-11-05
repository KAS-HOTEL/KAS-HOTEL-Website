import type { ReactNode } from 'react';
import styles from './Overview.module.css';

/**
 * One group of fields on an authoring form.
 *
 * <h2>Why not `Card`</h2>
 *
 * `Card` is the console's generic container and it is used for everything —
 * read-only detail, tables, panels. On a long form that made every group look
 * like a separate object of equal weight, so a nine-field form read as four
 * unrelated boxes rather than as one form with four parts.
 *
 * <p>This is a form section: a titled region with a visible boundary and one
 * optional note. Stronger border than `Card` deliberately, because grouping is
 * the only thing keeping a long form legible.
 *
 * <h2>One note, not one per field</h2>
 *
 * The `note` slot exists so a rule that applies to the whole group — "both
 * languages are required before review" — is stated once instead of repeated
 * under every input. Repeating it made the form twice as tall and taught the
 * reader to skip descriptions, including the ones that mattered.
 */
export function FormSection({
  title,
  note,
  actions,
  children,
}: {
  readonly title: string;
  /** A rule that applies to the whole group. Omitted when the labels suffice. */
  readonly note?: string;
  /** A control belonging to the group as a whole — "add a bed", say. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const id = `section-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <section className={styles.formSection} aria-labelledby={id}>
      <div className={styles.formSectionHead}>
        <div className={styles.formSectionHeadText}>
          <h2 className={styles.formSectionTitle} id={id}>
            {title}
          </h2>
          {note === undefined ? null : <p className={styles.formSectionNote}>{note}</p>}
        </div>
        {actions === undefined ? null : (
          <div className={styles.formSectionActions}>{actions}</div>
        )}
      </div>
      <div className={styles.formSectionBody}>{children}</div>
    </section>
  );
}
