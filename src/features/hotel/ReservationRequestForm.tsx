'use client';

import { useRef, useState } from 'react';
import { reservationsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/lib/domain/availability';
import type { Quote } from '@/lib/domain/quote';
import {
  ACCEPTED_TERMS_VERSION,
  requestCopy,
  type RequestCopy,
} from './requestMessages';
import {
  buildRequest,
  guestProblems,
  newIdempotencyKey,
  submissionSignature,
  toGuestField,
  type GuestProblems,
  type ReservationRequest,
  type RequestReceipt,
  type SubmissionState,
} from '@/lib/domain/reservationRequest';
import { Button, Input, Select, Textarea } from '@/ui/primitives';
import { RequestConfirmation } from './RequestConfirmation';
import styles from './Hotel.module.css';

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export function ReservationRequestForm({
  quote,
  propertySlug,
  propertyName,
  adults,
  locale,
  onReset,
}: {
  readonly quote: Quote;
  readonly propertySlug: string;
  readonly propertyName: string;
  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  readonly adults: number;
  readonly locale: string;
  /** Clears the quote above, so "change your dates" leads somewhere real. */
  readonly onReset: () => void;
}) {
  const copy = requestCopy(locale);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [preferredChannel, setPreferredChannel] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [terms, setTerms] = useState(false);

  const [state, setState] = useState<SubmissionState>('IDLE');
  const [problems, setProblems] = useState<GuestProblems>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<RequestReceipt | null>(null);

  /**
   * The key, and the submission it belongs to.
   *
   * A ref rather than state on purpose: it must survive a re-render without
   * causing one, and it must never be reset by React re-running the component.
   */
  const submission = useRef<{ readonly key: string; readonly signature: string } | null>(null);

  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  function keyFor(request: ReservationRequest): string {
    const signature = submissionSignature(request);
    const current = submission.current;
    if (current !== null && current.signature === signature) {
      return current.key;
    }
    const key = newIdempotencyKey();
    submission.current = { key, signature };
    return key;
  }

  const busy = state === 'SUBMITTING';

  async function submit(): Promise<void> {
    // Guards the double click, the Enter key and the impatient second tap.
    if (busy) {
      return;
    }

    setState('VALIDATING');
    setFormError(null);
    setCorrelationId(null);

    const guest = { fullName, email, phone, country, preferredChannel, bestTimeToContact: bestTime };
    const found = guestProblems(guest, terms, copy);
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setState('VALIDATION_ERROR');
      setFormError(copy.fixFields);
      return;
    }
    setProblems({});

    const request = buildRequest({
      propertySlug,
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      adults,
      lines: quote.lines.map((line) => ({
        roomTypeSlug: line.roomTypeSlug,
        quantity: line.quantity,
      })),
      guest,
      specialRequests,
      acceptedTermsVersion: ACCEPTED_TERMS_VERSION,
      marketingConsent,
      locale,
    });

    setState('SUBMITTING');
    try {
      setReceipt(await reservationsApi.request(request, keyFor(request), locale));
      setState('SUCCESS');
    } catch (caught) {
      failed(caught);
    }
  }

  /**
   * Turns a failure into something the guest can act on.
   *
   * The backend's own 422 text is preserved where it is actionable — doc 58's
   * messages are authored for the caller — but `NO_AVAILABILITY` gets guest
   * wording instead, because the frozen message names room type slugs.
   */
  function failed(caught: unknown): void {
    if (!(caught instanceof ApiError)) {
      // Never reached the server, or never came back. The key is kept, so the
      // retry below cannot become a second reservation.
      setFormError(copy.errorNetwork);
      setState('NETWORK_ERROR');
      return;
    }

    setCorrelationId(caught.correlationId);

    if (caught.status === 400) {
      const mapped: GuestProblems = {};
      let unmapped: string | null = null;
      for (const detail of caught.details) {
        const field = detail.field === null ? null : toGuestField(detail.field);
        if (field !== null) {
          mapped[field] = detail.message;
        } else {
          unmapped = detail.message;
        }
      }
      setProblems(mapped);
      setFormError(
        Object.keys(mapped).length > 0 ? copy.fixFields : (unmapped ?? caught.message),
      );
      setState('VALIDATION_ERROR');
      return;
    }

    if (caught.isNotFound) {
      setFormError(copy.errorNotFound);
      setState('SERVER_ERROR');
      return;
    }

    if (caught.code === 'IDEMPOTENCY_KEY_REUSED') {
      // Never a success, never an automatic re-send under a fresh key. Editing
      // any field mints a new key on its own, which is the recovery.
      setFormError(copy.errorKeyReused);
      setState('SERVER_ERROR');
      return;
    }

    if (caught.code === 'NO_AVAILABILITY') {
      // Doc 120 §2 — `alternatives` is out of V1 scope. No nearest dates, no
      // other properties, and no empty array pretending the server looked.
      setFormError(copy.errorNoAvailability);
      setState('SERVER_ERROR');
      return;
    }

    setFormError(caught.isUnprocessable ? caught.message : copy.errorServer);
    setState('SERVER_ERROR');
  }

  if (state === 'SUCCESS' && receipt !== null) {
    return <RequestConfirmation receipt={receipt} copy={copy} locale={locale} />;
  }

  return (
    <section className={styles.request} aria-labelledby="request-title">
      <h3 className={styles.requestTitle} id="request-title">
        {copy.title}
      </h3>
      <p className={styles.quoteNote}>{copy.intro}</p>

      <StaySummary quote={quote} propertyName={propertyName} copy={copy} />

      <div className={styles.requestFields}>
        <Input
          id="guest-full-name"
          label={copy.fullName}
          description={copy.fullNameHint}
          required
          autoComplete="name"
          value={fullName}
          error={problems.fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <Input
          id="guest-email"
          label={copy.email}
          description={copy.emailHint}
          required
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={problems.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          id="guest-phone"
          label={copy.phone}
          description={copy.phoneHint}
          required
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          error={problems.phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <Input
          id="guest-country"
          label={copy.country}
          description={copy.countryHint}
          placeholder={copy.countryPlaceholder}
          autoComplete="country"
          maxLength={2}
          value={country}
          error={problems.country}
          onChange={(event) => setCountry(event.target.value.toUpperCase())}
        />
        <Select
          id="guest-channel"
          label={copy.preferredChannel}
          value={preferredChannel}
          onChange={(event) => setPreferredChannel(event.target.value)}
          options={[
            { value: '', label: copy.notSpecified },
            // The four values `contact_channel` admits, and nothing else.
            { value: 'PHONE', label: copy.channelPhone },
            { value: 'EMAIL', label: copy.channelEmail },
            { value: 'ZALO', label: copy.channelZalo },
            { value: 'SMS', label: copy.channelSms },
          ]}
        />
        <Select
          id="guest-best-time"
          label={copy.bestTime}
          value={bestTime}
          onChange={(event) => setBestTime(event.target.value)}
          options={[
            { value: '', label: copy.notSpecified },
            { value: 'MORNING', label: copy.timeMorning },
            { value: 'AFTERNOON', label: copy.timeAfternoon },
            { value: 'EVENING', label: copy.timeEvening },
          ]}
        />
      </div>

      <Textarea
        id="guest-special-requests"
        label={copy.specialRequests}
        description={copy.specialRequestsHint}
        rows={3}
        value={specialRequests}
        onChange={(event) => setSpecialRequests(event.target.value)}
      />

      {/* Doc 26 §7.4 — no child control, because config B10 is OPEN. */}
      <p className={styles.quoteNote}>{copy.noChildren}</p>

      <div className={styles.requestConsents}>
        <label className={styles.checkboxRow} htmlFor="guest-marketing">
          <input
            id="guest-marketing"
            type="checkbox"
            checked={marketingConsent}
            onChange={(event) => setMarketingConsent(event.target.checked)}
          />
          <span>{copy.marketingConsent}</span>
        </label>

        <label className={styles.checkboxRow} htmlFor="guest-terms">
          <input
            id="guest-terms"
            type="checkbox"
            required
            checked={terms}
            aria-invalid={problems.terms ? true : undefined}
            aria-describedby={problems.terms ? 'guest-terms-error' : undefined}
            onChange={(event) => setTerms(event.target.checked)}
          />
          <span>
            {copy.terms} <span className={styles.required}>*</span>
          </span>
        </label>
        {problems.terms === undefined ? null : (
          <p className={styles.searchProblem} id="guest-terms-error">
            {problems.terms}
          </p>
        )}
      </div>

      <div className={styles.requestActions}>
        <Button loading={busy} disabled={busy} onClick={() => void submit()}>
          {busy ? copy.submitting : copy.submit}
        </Button>
        {state === 'NETWORK_ERROR' ? (
          // Deliberately the same handler: `keyFor` returns the key this
          // submission already owns, so this cannot create a second request.
          <Button variant="secondary" disabled={busy} onClick={() => void submit()}>
            {copy.retry}
          </Button>
        ) : null}
        {state === 'SERVER_ERROR' && formError === copy.errorNoAvailability ? (
          <Button variant="secondary" onClick={onReset}>
            {copy.retry}
          </Button>
        ) : null}
      </div>

      {/* One live region for the whole submission, so a change is announced once. */}
      <div aria-live="polite" aria-atomic="true">
        {busy ? <p className={styles.quoteNote}>{copy.submitting}</p> : null}
        {formError === null ? null : (
          <p className={styles.searchProblem} role="alert">
            {formError}
          </p>
        )}
        {correlationId === null ? null : (
          <p className={styles.quoteNote}>{copy.reference(correlationId)}</p>
        )}
      </div>

      <p className={styles.quoteNote}>{copy.notFinalPrice}</p>
    </section>
  );
}

/** What the backend priced, restated so the guest can check it before sending. */
function StaySummary({
  quote,
  propertyName,
  copy,
}: {
  readonly quote: Quote;
  readonly propertyName: string;
  readonly copy: RequestCopy;
}) {
  return (
    <dl className={styles.requestSummary} aria-label={copy.summaryTitle}>
      <div className={styles.summaryRow}>
        <dt>{copy.summaryProperty}</dt>
        <dd>{propertyName}</dd>
      </div>
      <div className={styles.summaryRow}>
        <dt>{copy.summaryDates}</dt>
        <dd>
          {quote.checkIn} → {quote.checkOut} ({copy.summaryNights(quote.nights)})
        </dd>
      </div>
      <div className={styles.summaryRow}>
        <dt>{copy.summaryRooms}</dt>
        <dd>
          {quote.lines.map((line) => `${line.roomTypeName} × ${line.quantity}`).join(', ')}
        </dd>
      </div>
      <div className={styles.summaryRow}>
        <dt>{copy.summaryEstimate}</dt>
        <dd>
          <strong>{formatMoney(quote.total)}</strong>
        </dd>
      </div>
    </dl>
  );
}

