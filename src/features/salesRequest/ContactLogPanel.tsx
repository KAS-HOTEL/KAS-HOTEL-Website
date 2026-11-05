'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { salesRequestsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, Input, Select, Textarea, useToast } from '@/ui/primitives';
import styles from './SalesRequest.module.css';

/**
 * S5 / S6 — log a contact with the guest. Doc 54 §4 S5/S6, doc 58 §5
 * {@code POST /admin/sales/requests/{reference}/contact}, permission
 * {@code sales.request.manage}.
 *
 * <h2>No confirmation, because nothing is destroyed</h2>
 *
 * {@code TerminalRequestPanel} takes two clicks because a decline or cancel
 * hands inventory back. Logging a conversation releases nothing, converts
 * nothing and moves no rooms — doc 54's Hold column for both S5 and S6 is
 * "maintained". A confirmation step here would be ceremony, and ceremony on
 * routine actions is what teaches agents to click through the ones that matter.
 *
 * <h2>The form is the record</h2>
 *
 * Channel and direction are required because
 * {@code reservation_contact_log.channel} and {@code .direction} are
 * {@code NOT NULL}; outcome and notes are optional because those columns are
 * nullable. The options are the {@code contact_channel} and
 * {@code contact_direction} enums, and <strong>no outcome vocabulary is
 * offered</strong> — the column is free text and no frozen document enumerates
 * outcomes.
 *
 * <p>Neither the timestamp nor the agent is a field. The server takes the first
 * from the column default and the second from the session; offering either
 * would let an agent log a conversation at a time it did not happen, or in
 * someone else's name.
 *
 * <h2>Which states offer it</h2>
 *
 * {@code ASSIGNED} (S6) and {@code AVAILABILITY_CHECK} (S5). Doc 54 has no
 * {@code CUSTOMER_CONTACTED → CUSTOMER_CONTACTED} row, so a request already
 * contacted is offered nothing rather than a control the server would answer
 * 409. The gate is a convenience; the backend refuses on its own.
 */
export function ContactLogPanel({
  reference,
  copy,
}: {
  readonly reference: string;
  readonly copy: ContactCopy;
}) {
  const router = useRouter();
  const toast = useToast();
  const [channel, setChannel] = useState('');
  const [direction, setDirection] = useState('OUTBOUND');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ready = channel !== '' && direction !== '';

  async function submit(): Promise<void> {
    // The guard is the state, not the button's disabled attribute: a repeated
    // Enter landing between the click and the re-render must still be a no-op,
    // or one conversation is logged twice.
    if (busy || !ready) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await salesRequestsApi.contact(reference, {
        channel,
        direction,
        // Absent, not empty: the columns are nullable and a blank string would
        // record that an agent typed nothing rather than that there was nothing.
        outcome: outcome.trim() === '' ? null : outcome.trim(),
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      // Re-read rather than patch. The 204 carries no state, and the status this
      // moved to is the server's to report.
      router.refresh();
      toast.show('success', copy.success);
    } catch (caught) {
      setProblem(describe(caught, copy));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={copy.title}>
      <div className={styles.declinePanel}>
        <p className={styles.note}>{copy.intro}</p>

        <Select
          id="contact-channel"
          label={copy.channelLabel}
          required
          value={channel}
          disabled={busy}
          placeholder={copy.channelPlaceholder}
          options={CHANNELS.map((value) => ({ value, label: copy.channels[value] }))}
          onChange={(event) => setChannel(event.target.value)}
        />

        <Select
          id="contact-direction"
          label={copy.directionLabel}
          required
          value={direction}
          disabled={busy}
          options={DIRECTIONS.map((value) => ({ value, label: copy.directions[value] }))}
          onChange={(event) => setDirection(event.target.value)}
        />

        <Input
          id="contact-outcome"
          label={copy.outcomeLabel}
          description={copy.outcomeHint}
          maxLength={200}
          value={outcome}
          disabled={busy}
          onChange={(event) => setOutcome(event.target.value)}
        />

        <Textarea
          id="contact-notes"
          label={copy.notesLabel}
          description={copy.notesHint}
          rows={3}
          maxLength={2000}
          value={notes}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />

        <div className={styles.declineActions}>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? copy.submitting : copy.action}
          </Button>
        </div>

        {/* One live region, so a failure is announced once. */}
        <div aria-live="polite" aria-atomic="true">
          {problem === null ? null : (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </div>

        <p className={styles.note}>{copy.noNotification}</p>
      </div>
    </Card>
  );
}

/** The {@code contact_channel} enum (V1:89), in the order an agent reaches for. */
const CHANNELS = ['PHONE', 'ZALO', 'EMAIL', 'SMS', 'IN_PERSON'] as const;

/** The {@code contact_direction} enum (V1:91). */
const DIRECTIONS = ['OUTBOUND', 'INBOUND'] as const;

/**
 * Maps a refusal onto something an agent can act on.
 *
 * The shared doc 58 §2.1 mapping does the general work, so a 404 stays "not
 * found" and never becomes "forbidden". Two cases get their own wording: a
 * **409**, which here means the request is no longer in a state a contact can be
 * logged from, and a **400**, where the backend already names the offending
 * field.
 */
function describe(caught: unknown, copy: ContactCopy): string {
  if (!(caught instanceof ApiError)) {
    return copy.errorNetwork;
  }
  if (caught.isConflict) {
    return copy.errorAlreadyMoved;
  }
  if (caught.status === 400) {
    return caught.details[0]?.message ?? copy.errorInvalid;
  }
  return messageFor(caught);
}

export interface ContactCopy {
  readonly title: string;
  readonly intro: string;
  readonly channelLabel: string;
  readonly channelPlaceholder: string;
  readonly channels: Readonly<Record<(typeof CHANNELS)[number], string>>;
  readonly directionLabel: string;
  readonly directions: Readonly<Record<(typeof DIRECTIONS)[number], string>>;
  readonly outcomeLabel: string;
  readonly outcomeHint: string;
  readonly notesLabel: string;
  readonly notesHint: string;
  readonly action: string;
  readonly submitting: string;
  readonly success: string;
  readonly noNotification: string;
  readonly errorAlreadyMoved: string;
  readonly errorInvalid: string;
  readonly errorNetwork: string;
}

/**
 * Vietnamese only — doc 69 §325, <em>"One console language in V1 (config A12)."</em>
 * The guest surface is bilingual; the console is not, and this is the console.
 */
export const CONTACT_COPY: ContactCopy = {
  title: 'Ghi nhận liên hệ',
  intro:
    'Ghi lại một lần trao đổi với khách. Thao tác này không thay đổi phòng đang giữ và không gửi gì cho khách.',
  channelLabel: 'Kênh liên hệ',
  channelPlaceholder: 'Chọn kênh liên hệ',
  channels: {
    PHONE: 'Điện thoại',
    ZALO: 'Zalo',
    EMAIL: 'Email',
    SMS: 'Tin nhắn SMS',
    IN_PERSON: 'Gặp trực tiếp',
  },
  directionLabel: 'Chiều liên hệ',
  directions: {
    OUTBOUND: 'KAS liên hệ khách',
    INBOUND: 'Khách liên hệ KAS',
  },
  outcomeLabel: 'Kết quả',
  outcomeHint: 'Không bắt buộc. Ví dụ: khách sẽ xác nhận trong hôm nay.',
  notesLabel: 'Ghi chú nội bộ',
  notesHint: 'Không bắt buộc. Chỉ hiển thị nội bộ, khách không nhìn thấy.',
  action: 'Ghi nhận liên hệ',
  submitting: 'Đang lưu…',
  success: 'Đã ghi nhận liên hệ. Yêu cầu chuyển sang trạng thái CUSTOMER_CONTACTED.',
  noNotification:
    'Hệ thống chưa gửi email hay thông báo nào cho khách. Đây chỉ là ghi nhận nội bộ.',
  errorAlreadyMoved:
    'Yêu cầu này không còn ở trạng thái có thể ghi nhận liên hệ. Vui lòng tải lại để xem trạng thái mới nhất.',
  errorInvalid: 'Thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại kênh và chiều liên hệ.',
  errorNetwork: 'Không kết nối được tới hệ thống. Vui lòng thử lại.',
};
