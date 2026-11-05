'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from '../icons';
import styles from './Toast.module.css';

/**
 * Transient notifications.
 *
 * <h2>The rule that matters</h2>
 *
 * A toast never carries a stack trace, a SQL fragment, a Java class name or a
 * raw exception. `GlobalExceptionHandler` already replaces 5xx detail with a
 * constant so those cannot leave the backend; this is the second place the same
 * rule applies, because the frontend must not undo it by rendering
 * `String(error)`.
 *
 * The only sanctioned way to show a failure is {@code showApiError}, which routes
 * through the shared doc 58 mapping — so a 404 stays "not found" and never
 * becomes "forbidden", preserving the cross-partner isolation doc 85 §6.3
 * depends on.
 *
 * <h2>Announcement</h2>
 *
 * The region is `aria-live="polite"` with `role="status"`, so a screen reader
 * hears the message without losing its place. Errors additionally carry
 * `role="alert"`.
 *
 * <h2>Which toasts go away by themselves</h2>
 *
 * A confirmation is worth reading once. Before this, none of them ever left:
 * uploading five room photographs left five "đã tải lên" cards stacked over the
 * gallery until each was dismissed by hand, which is a chore charged to the
 * operator for the crime of succeeding.
 *
 * <p>So `success` and `info` retire themselves after {@link #AUTO_DISMISS_MS}.
 * `warning` and `error` do not, and that asymmetry is deliberate rather than an
 * omission — a failure carries the correlation id support will ask for, and
 * timing out the only copy of it would mean the user has to reproduce the fault
 * to get it back.
 */

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

/**
 * How long a self-retiring toast stays, in milliseconds.
 *
 * <p>Long enough to read a short Vietnamese sentence without hurrying, short
 * enough that a run of saves does not queue up behind itself.
 */
const AUTO_DISMISS_MS = 3000;

/** The tones that leave on their own. Anything absent here waits to be read. */
const SELF_DISMISSING: ReadonlySet<ToastTone> = new Set<ToastTone>(['success', 'info']);

/**
 * The most toasts on screen at once.
 *
 * <p>Self-dismissal already stops confirmations piling up. This is for the tones
 * that stay: a loop failing on every iteration would otherwise paper over the
 * screen it is reporting on. The oldest goes first, so the newest failure — the
 * one whose correlation id is still worth quoting — is always the visible one.
 */
const MAX_VISIBLE = 4;

interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  /** Correlation id, shown so a user can quote it to support. */
  readonly reference?: string | undefined;
}

interface ToastApi {
  readonly show: (tone: ToastTone, message: string, reference?: string) => void;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, message: string, reference?: string) => {
    nextId += 1;
    const toast: Toast = { id: nextId, tone, message, reference };
    setToasts((current) => [...current, toast].slice(-MAX_VISIBLE));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * @throws when used outside {@link ToastProvider} — a silent no-op would hide
 *         failures from the user, which is the opposite of what this is for.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return api;
}

/**
 * One toast, owning its own retirement.
 *
 * <h2>Why the timer lives here and not in the provider</h2>
 *
 * A timer per card is cancelled by React unmounting the card — whether it left
 * because it timed out, because the X was pressed, or because the stack cap
 * pushed it off the end. A map of timers held in the provider would have to be
 * reconciled against the list by hand in all three cases, and the third is the
 * one that would be forgotten.
 *
 * <h2>Hovering stops the clock</h2>
 *
 * Pointer over the card, or keyboard focus inside it, pauses the countdown: a
 * toast carrying a reference the user is halfway through copying must not
 * vanish mid-selection. Leaving restarts the full interval rather than resuming
 * the remainder — simpler, and erring towards giving the reader more time.
 */
function ToastCard({
  toast,
  onDismiss,
}: {
  readonly toast: Toast;
  readonly onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const selfDismissing = SELF_DISMISSING.has(toast.tone);

  useEffect(() => {
    if (!selfDismissing || paused) {
      return;
    }
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [selfDismissing, paused, toast.id, onDismiss]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.tone]}`}
      role={toast.tone === 'error' ? 'alert' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span className={styles.icon}>{iconFor(toast.tone)}</span>
      <div className={styles.content}>
        <span>{toast.message}</span>
        {toast.reference === undefined ? null : (
          <span className={styles.reference}>Mã tham chiếu: {toast.reference}</span>
        )}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Đóng thông báo"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

function iconFor(tone: ToastTone): ReactNode {
  switch (tone) {
    case 'success':
      return <CheckIcon size={18} />;
    case 'error':
    case 'warning':
      return <AlertIcon size={18} />;
    case 'info':
      return <InfoIcon size={18} />;
    default:
      return null;
  }
}
