'use client';

import { useCallback, useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from '../icons';
import { Button } from './Button';
import styles from './Dialog.module.css';

/**
 * Modal, Drawer and ConfirmDialog — one accessible core, three presentations.
 *
 * <h2>What the core actually does</h2>
 *
 * <ul>
 *   <li><strong>Focus moves in</strong> when the dialog opens, and <strong>returns</strong>
 *       to whatever opened it on close. Without the return, a keyboard user is
 *       dumped at the top of the document every time they dismiss something.</li>
 *   <li><strong>Tab is trapped.</strong> Focus cycles inside the dialog; it cannot
 *       reach the page behind, which is still visible and would be confusing to
 *       operate blind.</li>
 *   <li><strong>Escape closes.</strong></li>
 *   <li><strong>Body scroll locks</strong>, so the page behind does not move under
 *       the overlay.</li>
 *   <li>The dialog has an <strong>accessible name</strong> via
 *       {@code aria-labelledby}, and {@code aria-modal} tells assistive tech the
 *       rest of the page is inert.</li>
 * </ul>
 *
 * <p>Written directly rather than pulled from a library: this is the one piece of
 * behaviour the whole console depends on for keyboard access, and it is ~60
 * lines. A dependency here would be larger than the thing it replaces.
 */

interface DialogCoreProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Presentation only — the behaviour is identical. */
  readonly variant?: 'modal' | 'drawer';
  /** Drawer edge. Ignored for modals. */
  readonly side?: 'right' | 'left';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Which dialog is on top.
 *
 * Escape and the Tab trap listen on the document, so with two dialogs open both
 * would react to one key press — a single Escape would dismiss a confirmation
 * *and* the drawer behind it, throwing away whatever the operator had filled in.
 * Only the last dialog to open responds; the rest wait their turn.
 */
const openDialogs: object[] = [];

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'modal',
  side = 'right',
}: DialogCoreProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  // Editing a field changes callers' callbacks. Keep the focus lifecycle tied
  // to opening/closing, while Escape always invokes the latest close handler.
  const closeFromEffect = useEffectEvent(onClose);

  const trapTab = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel || event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      // Nothing to focus: keep focus on the panel rather than letting it escape.
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    const token = {};
    openDialogs.push(token);

    const onKeyDown = (event: KeyboardEvent) => {
      // Not the topmost dialog: a dialog opened on top of this one owns the
      // keyboard until it closes.
      if (openDialogs[openDialogs.length - 1] !== token) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFromEffect();
        return;
      }
      trapTab(event);
    };

    document.addEventListener('keydown', onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the panel itself rather than its first control: announcing the
    // dialog's name before its fields is what tells a screen-reader user where
    // they now are.
    panelRef.current?.focus();

    return () => {
      const index = openDialogs.indexOf(token);
      if (index !== -1) {
        openDialogs.splice(index, 1);
      }
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, [open, trapTab]);

  if (!open) {
    return null;
  }

  const panelClass =
    variant === 'drawer'
      ? `${styles.panel} ${styles.drawer} ${side === 'left' ? styles.left : styles.right}`
      : `${styles.panel} ${styles.modal}`;

  return (
    <div
      className={styles.overlay}
      // Clicking the backdrop dismisses, but only the backdrop — a click that
      // started inside the panel and ended outside must not close it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Đóng">
            <CloseIcon size={18} />
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Modal(props: Omit<DialogCoreProps, 'variant' | 'side'>) {
  return <Dialog {...props} variant="modal" />;
}

export function Drawer(props: Omit<DialogCoreProps, 'variant'>) {
  return <Dialog {...props} variant="drawer" />;
}

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The confirmation step for a consequential action.
 *
 * Doc 56 §7 makes the preview before a bulk rate apply mandatory — "Applying a
 * rate across 90 days without seeing the result is how revenue accidents
 * happen" — and this is the component that stands between the operator and that
 * kind of mistake. `children` carries the effect summary, so the confirmation
 * always states what is about to happen rather than asking "are you sure?".
 *
 * `busy` disables both actions while the request is in flight: a double-submitted
 * bulk apply is exactly the accident this exists to prevent.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Huỷ',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
