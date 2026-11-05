'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor as sharedMessageFor } from '@/features/auth/messages';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, Textarea, useToast } from '@/ui/primitives';
import styles from './SalesRequest.module.css';

/**
 * The shape S11 decline and S12 cancel share.
 *
 * <h2>Why one component and not two</h2>
 *
 * Doc 58 §5 puts {@code /decline} and {@code /cancel} on <strong>one row</strong>
 * — one permission, one guard, "reason required" — and doc 54 gives S11 and S12
 * the same source set ("any non-terminal") and the same Hold column ("all holds
 * released"). Two components differing only in strings would drift: the
 * mid-flight defect fixed in the decline panel would have had to be found twice.
 *
 * <p>What differs between them is copy and which endpoint is called, so that is
 * what the callers supply. Everything below — the guard, the two clicks, the
 * busy handling, the refusal mapping — is the part that must not diverge.
 *
 * <h2>Two clicks, never one</h2>
 *
 * Both transitions are terminal and both release inventory. The reason field
 * must be filled and the action confirmed; the button disables in flight; and a
 * failure is never re-sent automatically.
 */
export function TerminalRequestPanel({
  reference,
  copy,
  submit: send,
}: {
  readonly reference: string;
  readonly copy: TerminalCopy;
  /** The endpoint this panel drives — the only behavioural difference. */
  readonly submit: (reference: string, reason: string) => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'confirming' | 'submitting' | 'error'>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  const busy = state === 'submitting';
  const ready = reason.trim() !== '';

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }
    setState('submitting');
    setProblem(null);
    try {
      await send(reference, reason.trim());
      // The server owns the new state. Re-read rather than patching a local copy,
      // so the screen can never show a status the record does not have.
      router.refresh();
      if (copy.success !== undefined) {
        toast.show('success', copy.success);
      }
    } catch (caught) {
      setProblem(messageFor(caught, copy));
      setState('error');
    }
  }

  return (
    <Card title={copy.title}>
      <div className={styles.declinePanel}>
        <p className={styles.note}>{copy.intro}</p>

        <Textarea
          id={copy.fieldId}
          label={copy.reasonLabel}
          description={copy.reasonHint}
          required
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />

        <div className={styles.declineActions}>
          {/*
            'submitting' counts as armed: dropping back to the action button
            mid-flight would swap the control under the agent's cursor and hide
            the progress they are waiting on.
          */}
          {state === 'confirming' || busy ? (
            <>
              <Button variant="danger" loading={busy} disabled={busy} onClick={() => void submit()}>
                {busy ? copy.submitting : copy.confirm}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setState('idle')}>
                {copy.cancel}
              </Button>
            </>
          ) : (
            <Button variant="danger" disabled={!ready || busy} onClick={() => setState('confirming')}>
              {copy.action}
            </Button>
          )}
        </div>

        {/* One live region, so a state change is announced once. */}
        <div aria-live="polite" aria-atomic="true">
          {state === 'confirming' ? <p className={styles.note}>{copy.confirmHint}</p> : null}
          {problem === null ? null : (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </div>

        {/* OQ-162 — stated before the agent commits, not after. */}
        <p className={styles.note}>{copy.noNotification}</p>
      </div>
    </Card>
  );
}

/**
 * Maps a refusal onto something an agent can act on.
 *
 * A **409** is the interesting one: it means somebody else already moved this
 * request. It is never retried automatically — the correct response is to look
 * at the record again, which is what the message says.
 *
 * <p><strong>401 and 403</strong> fall through to the shared doc 58 §2.1
 * mapping. Neither is about this transition — one is an expired session, the
 * other a missing permission — and the console already has one sentence for
 * each. <strong>404 does not</strong>: it is the ownership boundary (doc 85
 * §6.3) and says something about this request rather than "resource".
 */
function messageFor(caught: unknown, copy: TerminalCopy): string {
  if (!(caught instanceof ApiError)) {
    return copy.errorNetwork;
  }
  if (caught.code === 'ILLEGAL_TRANSITION') {
    return copy.errorAlreadyMoved;
  }
  if (caught.isNotFound) {
    return copy.errorNotFound;
  }
  if (caught.status === 400) {
    // The backend's own field message, which for these endpoints is about the reason.
    return caught.details[0]?.message ?? caught.message;
  }
  if (caught.isUnauthenticated || caught.isForbidden) {
    return sharedMessageFor(caught);
  }
  return copy.errorServer;
}

export interface TerminalCopy {
  /** Distinct per panel: two panels can be on screen at once. */
  readonly fieldId: string;
  readonly title: string;
  readonly intro: string;
  readonly reasonLabel: string;
  readonly reasonHint: string;
  readonly action: string;
  readonly confirm: string;
  readonly confirmHint: string;
  readonly cancel: string;
  readonly submitting: string;
  /** Omitted where the panel reports success by disappearing. */
  readonly success?: string;
  readonly noNotification: string;
  readonly errorAlreadyMoved: string;
  readonly errorNotFound: string;
  readonly errorNetwork: string;
  readonly errorServer: string;
}
