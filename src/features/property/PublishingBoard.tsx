'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { propertiesApi, submissionsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  lifecycleLabel,
  lifecycleTone,
  propertyLabel,
  type PropertyAdminView,
  type PropertyCompleteness,
} from '@/lib/domain/property';
import { Badge, Button, useToast } from '@/ui/primitives';
import { revalidatePublishing } from './actions';
import { PropertyCover } from './PropertyCover';
import type { PublishingRow } from './publishing';
import styles from './Publishing.module.css';

/**
 * The Admin screen that takes a hotel from a finished draft to a live listing.
 *
 * <h2>Two gates, both already in the backend</h2>
 *
 * A hotel becomes visible to guests in one step and bookable in another, and
 * this board performs both without inventing either:
 *
 * <ol>
 *   <li><strong>Approval</strong> — {@code POST /admin/property-submissions/
 *       {id}/approve}. Moves {@code DRAFT → COMING_SOON} and publishes every
 *       room type, in one transaction. {@code COMING_SOON} is already listed on
 *       the public site, so this is the step that makes the hotel visible.</li>
 *   <li><strong>Publication</strong> — {@code POST /admin/properties/{id}/
 *       publish}. Moves {@code COMING_SOON → OPEN}, the only state availability
 *       and rates quote against. This is the step that makes it bookable.</li>
 * </ol>
 *
 * <h2>Only the action the state actually permits</h2>
 *
 * A row offers exactly one button, or none. `PropertyPublicationService`
 * publishes only from `COMING_SOON`, and `SubmissionStatus.canTransitionTo`
 * decides only from `SUBMITTED` — so a `DRAFT` with nothing in the queue is
 * shown as waiting for its partner rather than given an Approve button that
 * would answer 404. Nothing here re-derives a rule: the lifecycle comes from
 * the property, the open submission from the queue, and the readiness list from
 * `GET /completeness`, which is the same check the backend gates on.
 *
 * <h2>A refusal is the product, not an error state</h2>
 *
 * An incomplete hotel comes back as a 400 naming every unmet item. Those are
 * shown verbatim, under the row that produced them, because the backend's own
 * words are the only accurate account of why a hotel cannot go live.
 */
export function PublishingBoard({
  rows,
  coversUnavailable,
  queueUnavailable,
}: {
  readonly rows: readonly PublishingRow[];
  readonly coversUnavailable: boolean;
  readonly queueUnavailable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  /** The row with a request in flight — so one click disables only its own button. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problems, setProblems] = useState<Readonly<Record<string, Problem>>>({});

  async function run(
    property: PropertyAdminView,
    call: () => Promise<unknown>,
    success: string,
  ): Promise<void> {
    if (busyId !== null) {
      return;
    }
    setBusyId(property.id);
    setProblems((current) => withoutKey(current, property.id));
    try {
      await call();
      await revalidatePublishing();
      // The server owns what happened next. Re-read rather than patching the
      // row here, so the board can never show a state the database does not.
      router.refresh();
      toast.show('success', success);
    } catch (caught) {
      setProblems((current) => ({ ...current, [property.id]: describe(caught) }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className={styles.board}>
      {rows.map((row) => {
        const { property } = row;
        const name = propertyLabel(property.names);
        const busy = busyId === property.id;
        const problem = problems[property.id];
        const missing = missingFields(row.completeness);

        return (
          <li key={property.id} className={styles.row}>
            <PropertyCover
              cover={row.cover}
              unavailable={coversUnavailable}
              className={styles.cover}
            />

            <div className={styles.identity}>
              <Link className={styles.name} href={`/admin/properties/${property.id}`}>{name}</Link>
              {/*
                Where it is, in words. The slug and the uuid address this hotel
                in the API and say nothing to the person deciding whether to
                put it on the website, so neither is printed.
              */}
              <span className={styles.place}>{place(property)}</span>
            </div>

            <div className={styles.state}>
              <Badge tone={lifecycleTone(property.lifecycleState)}>
                {lifecycleLabel(property.lifecycleState)}
              </Badge>
              <span className={styles.readiness}>
                {readiness(row, missing, queueUnavailable)}
              </span>
            </div>

            <div className={styles.action}>
              <RowAction
                row={row}
                busy={busy}
                disabled={busyId !== null && !busy}
                onApprove={(submissionId) =>
                  void run(
                    property,
                    () => submissionsApi.approve(submissionId),
                    `Đã duyệt ${name}. Khách sạn đã hiển thị trên website.`,
                  )
                }
                onPublish={() =>
                  void run(
                    property,
                    () => propertiesApi.publish(property.id, { version: property.version }),
                    `Đã mở bán ${name}.`,
                  )
                }
              />
            </div>

            {/*
              Why this hotel cannot go live, in the backend's own words.

              Two sources, never merged: the checklist it fails today, and the
              refusal it received when someone pressed the button anyway. The
              second can name things the first cannot — a signature line
              another hotel took first, a room type still in draft — so
              collapsing them would lose the reason that actually matters.
            */}
            {missing.length === 0 || !offersAction(row) ? null : (
              <ul className={styles.blockers}>
                {missing.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            )}

            {problem === undefined ? null : (
              <div className={styles.problem} role="alert">
                <p className={styles.problemMessage}>{problem.message}</p>
                {problem.fields.length === 0 ? null : (
                  <ul className={styles.blockers}>
                    {problem.fields.map(([field, detail]) => (
                      <li key={field}>
                        <strong>{field}</strong>
                        {detail === '' ? null : <> — {detail}</>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The one control a row is entitled to.
 *
 * Every branch maps to a transition the backend will actually accept. The two
 * that offer nothing say what is missing instead of disabling a button whose
 * label would promise something it cannot do.
 */
function RowAction({
  row,
  busy,
  disabled,
  onApprove,
  onPublish,
}: {
  readonly row: PublishingRow;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onApprove: (submissionId: string) => void;
  readonly onPublish: () => void;
}) {
  const { property, openSubmissionId } = row;
  const ready = row.completeness?.complete === true;

  if (property.lifecycleState === 'DRAFT') {
    if (openSubmissionId === null) {
      /*
        No open submission, so `approve` would answer 404. The hotel has to be
        sent for review from its own property page, which is where the submit
        action lives and where the missing fields can be filled in.
      */
      return (
        <Link href={`/partner/properties/${property.id}`} className={styles.secondaryLink}>
          Mở hồ sơ khách sạn
        </Link>
      );
    }
    return (
      <Button
        loading={busy}
        disabled={disabled || busy}
        onClick={() => onApprove(openSubmissionId)}
      >
        Duyệt hồ sơ
      </Button>
    );
  }

  if (property.lifecycleState === 'COMING_SOON') {
    return (
      <Button
        loading={busy}
        // The checklist the backend gates on. When it could not be read the
        // button stays live: guessing "not ready" from a failed read would
        // block a hotel that is in fact publishable.
        disabled={disabled || busy || (row.completeness !== null && !ready)}
        onClick={onPublish}
      >
        Mở bán
      </Button>
    );
  }

  return <span className={styles.noAction}>Không có thao tác</span>;
}

/** Whether this row has a transition available, and so a checklist worth showing. */
function offersAction(row: PublishingRow): boolean {
  return (
    (row.property.lifecycleState === 'DRAFT' && row.openSubmissionId !== null)
    || row.property.lifecycleState === 'COMING_SOON'
  );
}

/**
 * What the admin needs to know before deciding: is this hotel ready, and if
 * not, is that because of its own record or because nobody has sent it yet.
 */
function readiness(
  row: PublishingRow,
  missing: readonly string[],
  queueUnavailable: boolean,
): string {
  const state = row.property.lifecycleState;

  if (state === 'OPEN') {
    return 'Khách có thể xem và đặt phòng';
  }
  if (state === 'COMING_SOON') {
    if (row.completeness === null) {
      return 'Đang hiển thị với khách · chưa đọc được tình trạng hồ sơ';
    }
    return row.completeness.complete
      ? 'Đang hiển thị với khách · sẵn sàng mở bán'
      : `Đang hiển thị với khách · còn thiếu ${missing.length} mục`;
  }
  if (state === 'DRAFT') {
    if (queueUnavailable) {
      return 'Chưa hiển thị với khách · chưa đọc được hàng đợi duyệt';
    }
    if (row.openSubmissionId === null) {
      return 'Chưa hiển thị với khách · đối tác chưa gửi duyệt';
    }
    return row.completeness?.complete === true
      ? 'Chờ duyệt · hồ sơ đã đủ'
      : `Chờ duyệt · còn thiếu ${missing.length} mục`;
  }
  return 'Không hiển thị với khách';
}

/** `Phường Bến Thành · Thành phố Hồ Chí Minh`, skipping whatever is unset. */
function place(property: PropertyAdminView): string {
  const parts = [property.ward, property.district, property.city].filter(
    (part): part is string => part !== null && part !== undefined && part.trim() !== '',
  );
  return parts.length === 0 ? 'Chưa có địa chỉ' : parts.join(' · ');
}

/** The backend's own field names, flattened. Never re-derived, never translated. */
function missingFields(completeness: PropertyCompleteness | null): readonly string[] {
  if (completeness === null) {
    return [];
  }
  return completeness.sections.flatMap((section) => section.missing);
}

interface Problem {
  readonly message: string;
  readonly fields: readonly (readonly [string, string])[];
}

const UNREACHABLE = 'Không thể kết nối tới hệ thống. Vui lòng thử lại.';

function describe(caught: unknown): Problem {
  if (!(caught instanceof ApiError)) {
    return { message: UNREACHABLE, fields: [] };
  }
  return {
    message: messageFor(caught),
    // The messages, not just the field names: the backend explains how to
    // clear each blocker, and dropping that leaves a checklist nobody can act
    // on.
    fields: Object.entries(caught.fieldErrors()),
  };
}

/** Clears one row's failure without disturbing another row's. */
function withoutKey(
  problems: Readonly<Record<string, Problem>>,
  key: string,
): Readonly<Record<string, Problem>> {
  return Object.fromEntries(Object.entries(problems).filter(([held]) => held !== key));
}
