import type { ReactNode } from 'react';
import type { ApiError } from '@/lib/api/errors';
import styles from './States.module.css';

/**
 * The UX states every screen owes the user.
 *
 * Centralised because "what does this look like when it is empty, slow, or
 * refused?" is answered once here rather than differently on forty screens.
 */

export function EmptyState({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      <h2 className={styles.title}>{title}</h2>
      {children ? <p className={styles.body}>{children}</p> : null}
    </div>
  );
}

export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: string }) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}

/**
 * Renders a failed call with the right words for its kind.
 *
 * The messages are the ones the brief specifies, and they never expose the
 * backend's own message for a 5xx — `GlobalExceptionHandler` already replaces
 * those with a constant, and the correlation id is what makes a report
 * actionable without showing the user anything internal.
 */
export function ErrorState({ error }: { readonly error: ApiError }) {
  const { title, body } = describe(error);
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {error.correlationId ? (
        <p className={styles.reference}>Reference: {error.correlationId}</p>
      ) : null}
    </div>
  );
}

function describe(error: ApiError): { title: string; body: string } {
  if (error.isUnauthenticated) {
    return { title: 'Please sign in', body: 'Your session has ended. Sign in to continue.' };
  }
  if (error.isForbidden) {
    return {
      title: 'Not permitted',
      body: 'You do not have permission to perform this action.',
    };
  }
  if (error.isNotFound) {
    // Deliberately identical wording whether the record is absent or merely
    // outside the caller's scope — doc 85 §6.3 returns 404 for both so that the
    // existence of another partner's records is never disclosed.
    return { title: 'Not found', body: 'The item you asked for could not be found.' };
  }
  if (error.isConflict) {
    return {
      title: 'This changed while you were editing',
      body: 'Someone else updated this information. Reload to see the latest version.',
    };
  }
  if (error.isUnprocessable) {
    return { title: 'Please check the details', body: error.message };
  }
  return {
    title: 'Something went wrong',
    body: 'We could not complete that just now. Please try again.',
  };
}

/**
 * A capability the backend does not yet provide.
 *
 * Used instead of building a screen that appears to work. Every use names the
 * open question so the boundary is traceable rather than a vague "coming soon".
 */
export function IntegrationBoundary({
  capability,
  reference,
}: {
  readonly capability: string;
  readonly reference: string;
}) {
  return (
    <div className={styles.state}>
      <h2 className={styles.title}>{capability} is not available yet</h2>
      <p className={styles.body}>
        This part of KAS has no backend contract yet, so it is shown as unavailable rather than
        simulated.
      </p>
      <p className={styles.reference}>{reference}</p>
    </div>
  );
}
