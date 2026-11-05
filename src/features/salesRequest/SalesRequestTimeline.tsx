import type { SalesRequestEvent } from '@/lib/domain/salesRequest';
import { Badge, Card } from '@/ui/primitives';
import styles from './SalesRequest.module.css';

/**
 * The request's transition history — `reservation_status_history`, read back.
 *
 * <h2>Entirely server-derived</h2>
 *
 * Every entry is a row the backend actually wrote. Nothing here infers a
 * transition from the current status, fills a gap, reorders, or adds an
 * optimistic entry for an action in flight. Six steps have been writing to this
 * table and this is the first thing to read it; a timeline that quietly invented
 * the missing parts would be worse than none.
 *
 * <h2>Who, only as far as the contract allows</h2>
 *
 * The history stores an `actor_id`, and this renders **none of it**. `app_user`
 * has no name column, its only human-readable identifier is an email address,
 * and no frozen document permits disclosing staff identity between colleagues —
 * doc 134 §5 recorded that as open when it blocked the assignment UI. So an
 * entry says whether a person or the system acted, which is what a timeline
 * needs, and settles nothing by the back door.
 *
 * <h2>Status names are not translated</h2>
 *
 * `REQUESTED`, `WON`, `EXPIRED` and the rest appear exactly as the record holds
 * them — the same vocabulary the status badge already uses on this page and in
 * the queue. Inventing friendlier Vietnamese labels would put a second name on
 * every state and risk the two drifting apart in meaning.
 */
export function SalesRequestTimeline({
  events,
  copy,
}: {
  readonly events: readonly SalesRequestEvent[];
  readonly copy: TimelineCopy;
}) {
  return (
    <Card title={copy.title}>
      {events.length === 0 ? (
        // Not an ordinary empty state: S1 writes an entry for every request, so
        // an empty timeline means a record is missing rather than absent.
        <p className={styles.problem} role="status">
          {copy.missing}
        </p>
      ) : (
        <ol className={styles.timeline}>
          {events.map((event, index) => (
            <li
              key={`${event.at}-${event.field}-${event.toStatus}`}
              className={styles.timelineEntry}
            >
              <div className={styles.timelineHeader}>
                <Badge tone={index === events.length - 1 ? 'info' : 'neutral'}>
                  {event.toStatus}
                </Badge>
                {/*
                  The lifecycle this row moved. A reservation carries two, and
                  doc 54 never conflates them — a WON sale and a CONFIRMED stay
                  are different facts recorded at the same instant.
                */}
                <span className={styles.timelineField}>
                  {event.field === 'STAY' ? copy.stay : copy.sales}
                </span>
                <span className={styles.timelineActor}>{actorLabel(event.actorType, copy)}</span>
                <time dateTime={event.at} className={styles.timelineAt}>
                  {event.at}
                </time>
              </div>

              {event.fromStatus === null ? null : (
                <p className={styles.timelineFrom}>
                  {copy.from} {event.fromStatus}
                </p>
              )}
              {event.reason === null ? null : (
                <p className={styles.timelineReason}>
                  {copy.reason}: {event.reason}
                </p>
              )}
              {event.note === null ? null : (
                <p className={styles.note}>{event.note}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * Translates the `actor_type` enum for display.
 *
 * <p>The three values are V1:93's, and translating a known vocabulary is the
 * console's existing convention. An unrecognised value falls back to itself
 * rather than to a guess — a new actor type should look unfamiliar, not be
 * quietly relabelled as one of the three that exist today.
 */
function actorLabel(actorType: string, copy: TimelineCopy): string {
  switch (actorType) {
    case 'SYSTEM':
      return copy.actorSystem;
    case 'ADMIN':
      return copy.actorAdmin;
    case 'CUSTOMER':
      return copy.actorCustomer;
    default:
      return actorType;
  }
}

export interface TimelineCopy {
  readonly title: string;
  readonly sales: string;
  readonly stay: string;
  readonly from: string;
  readonly reason: string;
  readonly actorSystem: string;
  readonly actorAdmin: string;
  readonly actorCustomer: string;
  readonly missing: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const TIMELINE_COPY: TimelineCopy = {
  title: 'Lịch sử xử lý',
  sales: 'Bán hàng',
  stay: 'Kỳ nghỉ',
  from: 'Từ',
  reason: 'Lý do',
  actorSystem: 'Hệ thống',
  actorAdmin: 'Nhân viên',
  actorCustomer: 'Khách',
  missing: 'Chưa ghi nhận được lịch sử xử lý của yêu cầu này.',
};
