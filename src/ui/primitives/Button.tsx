import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  /**
   * A request is in flight. Shows a spinner and marks the control busy — but
   * does <strong>not</strong> disable on its own, so a caller must decide
   * whether the action is re-entrant. For a bulk rate apply it must not be.
   */
  readonly loading?: boolean;
  readonly children: ReactNode;
}

/**
 * The one button.
 *
 * Height comes from `--density-control-height`, so the same component is 44px in
 * the customer experience and 34px in the management consoles without a second
 * implementation — doc 80 §1's density split.
 *
 * `aria-busy` rather than a visual spinner alone: doc 82 forbids state carried
 * by appearance only, and a screen-reader user otherwise has no signal that a
 * submit is still running.
 *
 * <h2>The children are structurally stable, and that is load-bearing</h2>
 *
 * Both the spinner and the label are <strong>always</strong> in the DOM; only
 * the spinner's `hidden` attribute changes. It used to be
 * `{loading ? <span/> : null}{children}`, which meant entering the loading
 * state asked React to insert an element immediately before a raw text node —
 * and callers change that text at the same moment:
 *
 * <pre>{@code <Button loading={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>}</pre>
 *
 * So one commit both inserted a node and replaced the text node it had to be
 * inserted before. When the text node React held a reference to was no longer
 * the child it expected, `insertBefore` threw
 * {@code NotFoundError: The node before which the new node is to be inserted is
 * not a child of this node} — which surfaced as a Next.js runtime overlay on
 * the room-type form <em>after the save had already succeeded</em>.
 *
 * <p>Wrapping the children in their own element removes the raw text node from
 * the button's child list, and keeping the spinner mounted removes the
 * insertion entirely: the transition is now an attribute toggle on a node that
 * never moves. Nothing about the loading state, the spinner or the semantics
 * changed — only the shape React has to reconcile.
 */
export function Button({
  variant = 'primary',
  loading = false,
  children,
  type,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      // Explicit: an unspecified button inside a form submits it, which is
      // rarely what a secondary or ghost button is for.
      type={type ?? 'button'}
      className={`${styles.button} ${styles[variant]}`}
      disabled={disabled}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {/* Always mounted; `hidden` is the only thing that changes. */}
      <span className={styles.spinner} aria-hidden="true" hidden={!loading} />
      {/* The label owns the text, so the button's children are two elements
          that never move rather than an optional node beside a text node. */}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
