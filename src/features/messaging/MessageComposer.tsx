'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { conversationsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { canSend, variablesIn, type MessageTemplate } from '@/lib/domain/conversation';
import { Button, Textarea, useToast } from '@/ui/primitives';
import styles from './Messaging.module.css';

/**
 * Writes one guest-visible message.
 *
 * <h2>Preview is a step, not a courtesy</h2>
 *
 * Doc 58 §5 requires it — *"Guest-visible; preview required before send"* — and
 * the reason is mechanical: the variables are filled from reservation data the
 * browser does not hold, so a preview computed here would show a different
 * sentence from the one the server stores. Pressing **Xem trước** asks the
 * server, and what comes back replaces the draft. The operator then sends
 * exactly the string they read.
 *
 * <p>Send stays disabled while any `{{variable}}` remains, which is the same
 * rule the backend enforces — mirrored so the operator is stopped by a disabled
 * button rather than by a 400.
 *
 * <h2>No optimistic message</h2>
 *
 * The response is the whole thread, and `router.refresh()` re-reads the server's
 * own record. Nothing is appended locally: a composer that painted the message
 * before the write landed would eventually show one the record does not have.
 *
 * <h2>One send at a time</h2>
 *
 * The guard is the state, not the button's `disabled` attribute — a second
 * Enter landing between the click and the re-render must still be a no-op.
 */
export function MessageComposer({
  reference,
  templates,
  copy,
}: {
  readonly reference: string;
  /** Enabled manual templates, offered as starting points. */
  readonly templates: readonly MessageTemplate[];
  readonly copy: ComposerCopy;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState(false);

  const pending = variablesIn(body);
  const ready = canSend(body);

  function edit(next: string): void {
    setBody(next);
    // Any edit invalidates the preview: the operator has not read this version.
    setPreviewed(false);
    setProblem(null);
  }

  function insert(id: string): void {
    const chosen = templates.find((template) => template.id === id);
    if (chosen === undefined) {
      setTemplateId(null);
      return;
    }
    setTemplateId(id);
    edit(chosen.body);
  }

  async function preview(): Promise<void> {
    if (busy !== null || body.trim() === '') {
      return;
    }
    setBusy('preview');
    setProblem(null);
    try {
      const resolved = await conversationsApi.preview(reference, body);
      // The server's rendering replaces the draft, so what is sent next is
      // exactly what was approved.
      setBody(resolved.body);
      setPreviewed(true);
    } catch (caught) {
      setProblem(describe(caught, copy));
    } finally {
      setBusy(null);
    }
  }

  async function send(): Promise<void> {
    if (busy !== null || !ready) {
      return;
    }
    setBusy('send');
    setProblem(null);
    try {
      await conversationsApi.record(reference, body.trim(), templateId ?? undefined);
      setBody('');
      setTemplateId(null);
      setPreviewed(false);
      // The server owns the thread. Re-read rather than appending locally.
      router.refresh();
      toast.show('success', copy.recorded);
    } catch (caught) {
      setProblem(describe(caught, copy));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className={styles.composer}
      aria-label={copy.legend}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {templates.length === 0 ? null : (
        <div className={styles.composerTemplates}>
          <label htmlFor="composer-template">{copy.template}</label>
          <select
            id="composer-template"
            className={styles.control}
            value={templateId ?? ''}
            disabled={busy !== null}
            onChange={(event) => insert(event.target.value)}
          >
            <option value="">{copy.templateNone}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Textarea
        id="composer-body"
        label={copy.body}
        rows={4}
        value={body}
        disabled={busy !== null}
        onChange={(event) => edit(event.target.value)}
      />

      {/*
        Words, not a red border: doc 82 forbids state carried by colour alone,
        and this one needs an instruction anyway — the operator has to know that
        previewing is what clears it.
      */}
      {pending.length === 0 ? null : (
        <p className={styles.composerPending} role="status">
          {copy.pendingVariables(pending.map((name) => `{{${name}}}`).join(', '))}
        </p>
      )}

      {previewed && pending.length === 0 ? (
        <p className={styles.composerPreviewed} role="status">
          {copy.previewed}
        </p>
      ) : null}

      {problem === null ? null : (
        <p className={styles.composerProblem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.composerActions}>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null || body.trim() === ''}
          onClick={() => void preview()}
        >
          {busy === 'preview' ? copy.previewing : copy.preview}
        </Button>
        <Button type="submit" disabled={busy !== null || !ready}>
          {busy === 'send' ? copy.recording : copy.record}
        </Button>
      </div>

      {/*
        The delivery position, where the operator is about to act on it. Not
        buried in a help page: an agent typing "see you at 3pm" needs to know
        the guest will not receive it.
      */}
    </form>
  );
}

function describe(caught: unknown, copy: ComposerCopy): string {
  if (caught instanceof ApiError) {
    return caught.isNotFound ? copy.gone : messageFor(caught);
  }
  return copy.failed;
}

export interface ComposerCopy {
  readonly legend: string;
  readonly body: string;
  readonly template: string;
  readonly templateNone: string;
  readonly preview: string;
  readonly previewing: string;
  readonly previewed: string;
  readonly record: string;
  readonly recording: string;
  readonly recorded: string;
  readonly failed: string;
  readonly gone: string;
  readonly pendingVariables: (names: string) => string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const COMPOSER_COPY: ComposerCopy = {
  legend: 'Soạn tin nhắn cho khách',
  body: 'Nội dung tin nhắn',
  template: 'Tin nhắn mẫu',
  templateNone: 'Không dùng mẫu',
  preview: 'Xem trước',
  previewing: 'Đang xem trước…',
  previewed: 'Đã điền đầy đủ thông tin từ đặt phòng. Đây là nội dung sẽ được lưu.',
  record: 'Lưu tin nhắn',
  recording: 'Đang lưu…',
  recorded: 'Đã lưu tin nhắn vào hồ sơ đặt phòng.',
  failed: 'Không lưu được tin nhắn. Vui lòng thử lại.',
  gone: 'Không tìm thấy đặt phòng này trong phạm vi tài khoản của bạn.',
  pendingVariables: (names) =>
    `Còn biến chưa được điền: ${names}. Bấm "Xem trước" để hệ thống điền từ đặt phòng.`,
};
