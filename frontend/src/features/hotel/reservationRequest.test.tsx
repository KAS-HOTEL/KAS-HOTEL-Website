// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { Quote } from '@/lib/domain/quote';
import {
  buildRequest,
  guestProblems,
  newIdempotencyKey,
  submissionSignature,
  toGuestField,
} from '@/lib/domain/reservationRequest';
import { requestCopy, ACCEPTED_TERMS_VERSION } from './requestMessages';

const requestApi = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  reservationsApi: { request: (...a: unknown[]) => requestApi(...a) },
}));

const { ReservationRequestForm } = await import('./ReservationRequestForm');

const SLUG = 'kas-milestone-premium-hotel';
const CHECK_IN = '2026-09-12';
const CHECK_OUT = '2026-09-14';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function quote(): Quote {
  return {
    propertySlug: SLUG,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    nights: 2,
    lines: [
      {
        roomTypeSlug: 'deluxe-room',
        roomTypeName: 'Deluxe Room',
        quantity: 2,
        nightlyFrom: { amountMinor: 1_850_000, currency: 'VND', exponent: 0 },
        subtotal: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      },
    ],
    roomsSubtotal: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
    total: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
    currency: 'VND',
    estimate: true,
  };
}

function receipt() {
  return {
    reference: 'KAS-260912-4F7A',
    status: 'REQUEST_RECEIVED',
    responsePromise: 'Within 24 hours',
    trackingUrlIssued: false,
    estimatedTotal: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
    estimateDisclaimer: 'Final amount is confirmed by the KAS team.',
  };
}

function form(locale = 'en') {
  return render(
    <ReservationRequestForm
      quote={quote()}
      propertySlug={SLUG}
      propertyName="KAS Milestone Premium Hotel"
      adults={2}
      locale={locale}
      onReset={() => {}}
    />,
  );
}

/** Fills every field the frozen DTO marks `@NotBlank`, plus the terms gate. */
async function fillValidGuest(locale = 'en'): Promise<void> {
  const copy = requestCopy(locale);
  await userEvent.type(screen.getByLabelText(new RegExp(copy.fullName)), 'Mai Tran');
  await userEvent.type(screen.getByLabelText(new RegExp(copy.email)), 'mai@example.com');
  await userEvent.type(screen.getByLabelText(new RegExp(copy.phone)), '+84 90 123 4567');
  await userEvent.click(screen.getByLabelText(new RegExp(copy.terms)));
}

function apiError(status: number, code: string, message: string, details: unknown[] = []) {
  return new ApiError(status, {
    code,
    message,
    details: details as never,
    correlationId: 'corr-123',
  });
}

beforeEach(() => {
  requestApi.mockReset();
});
afterEach(cleanup);

describe('reservation request — pure domain', () => {
  const copy = requestCopy('en');

  it('mirrors the frozen DTO and nothing more', () => {
    // fullName, email and phone are @NotBlank; country is optional but must
    // match ^[A-Za-z]{2}$; terms is the form's own gate.
    const empty = guestProblems({ fullName: '', email: '', phone: '' }, false, copy);
    expect(Object.keys(empty).sort()).toEqual(['email', 'fullName', 'phone', 'terms']);

    const ok = guestProblems(
      { fullName: 'Mai', email: 'mai@example.com', phone: '+84901234567', country: 'VN' },
      true,
      copy,
    );
    expect(ok).toEqual({});
  });

  it('refuses a malformed country before it becomes a 400', () => {
    const bad = guestProblems(
      { fullName: 'Mai', email: 'mai@example.com', phone: '+84901234567', country: 'VNM' },
      true,
      copy,
    );
    expect(bad.country).toBe(copy.countryInvalid);
    // Absent is legal — the DTO has no @NotBlank on country.
    expect(
      guestProblems(
        { fullName: 'Mai', email: 'mai@example.com', phone: '+84901234567', country: '' },
        true,
        copy,
      ),
    ).toEqual({});
  });

  it('omits empty optionals rather than sending blanks', () => {
    const built = buildRequest({
      propertySlug: SLUG,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      adults: 2,
      lines: [{ roomTypeSlug: 'deluxe-room', quantity: 2 }],
      guest: { fullName: ' Mai ', email: ' mai@example.com ', phone: ' +84901234567 ' },
      specialRequests: '   ',
      acceptedTermsVersion: ACCEPTED_TERMS_VERSION,
      marketingConsent: false,
      locale: 'en',
    });
    // The backend fingerprints the canonical body, so "" and omitted are two
    // different requests and one guest input must not produce both.
    expect('specialRequests' in built).toBe(false);
    expect('country' in built.guest).toBe(false);
    expect(built.guest.fullName).toBe('Mai');
    // Config B10 — always refused, so always absent.
    expect(built.children).toBe(0);
    expect(built.childAges).toEqual([]);
    // Config B23 — an offer code is refused, so no key is sent at all.
    expect('offerCode' in built).toBe(false);
  });

  it('mints UUID keys and changes the signature only on a material edit', () => {
    expect(newIdempotencyKey()).toMatch(UUID_SHAPE);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());

    const base = {
      propertySlug: SLUG,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      adults: 2,
      lines: [{ roomTypeSlug: 'deluxe-room', quantity: 2 }],
      guest: { fullName: 'Mai', email: 'mai@example.com', phone: '+84901234567' },
      specialRequests: '',
      acceptedTermsVersion: ACCEPTED_TERMS_VERSION,
      marketingConsent: false,
      locale: 'en',
    };
    expect(submissionSignature(buildRequest(base))).toBe(
      submissionSignature(buildRequest({ ...base })),
    );
    expect(submissionSignature(buildRequest(base))).not.toBe(
      submissionSignature(buildRequest({ ...base, guest: { ...base.guest, phone: '+84999' } })),
    );
  });

  it('sends only keys the frozen DTO declares, at every level', () => {
    // `ReservationRequestBody` and its two nested records, transcribed. The
    // backend runs `fail-on-unknown-properties: true`, so a key this module
    // invented is a 400 for the whole request rather than a field quietly
    // ignored — and a key it stopped sending is a silent loss. Neither shows up
    // in a mocked test, so the shape is pinned here instead.
    const BODY = [
      'propertySlug', 'checkIn', 'checkOut', 'adults', 'children', 'childAges',
      'lines', 'guest', 'specialRequests', 'discoveryChannel', 'offerCode',
      'acceptedTermsVersion', 'marketingConsent', 'locale',
    ];
    const GUEST = ['fullName', 'email', 'phone', 'country', 'preferredChannel',
      'bestTimeToContact'];
    const LINE = ['roomTypeSlug', 'quantity'];

    const full = buildRequest({
      propertySlug: SLUG,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      adults: 2,
      lines: [{ roomTypeSlug: 'deluxe-room', quantity: 2 }],
      guest: {
        fullName: 'Mai',
        email: 'mai@example.com',
        phone: '+84901234567',
        country: 'VN',
        preferredChannel: 'EMAIL',
        bestTimeToContact: 'MORNING',
      },
      specialRequests: 'Late arrival',
      acceptedTermsVersion: ACCEPTED_TERMS_VERSION,
      marketingConsent: true,
      locale: 'en',
    });

    for (const key of Object.keys(full)) {
      expect(BODY, `body key "${key}" is not in the frozen DTO`).toContain(key);
    }
    for (const key of Object.keys(full.guest)) {
      expect(GUEST, `guest key "${key}" is not in the frozen DTO`).toContain(key);
    }
    for (const key of Object.keys(full.lines[0]!)) {
      expect(LINE, `line key "${key}" is not in the frozen DTO`).toContain(key);
    }

    // And every @NotBlank / @NotNull field is actually present, so a refactor
    // that drops one fails here rather than at a guest's submission.
    for (const required of ['propertySlug', 'checkIn', 'checkOut', 'adults',
      'children', 'childAges', 'lines', 'guest']) {
      expect(required in full, `required key "${required}" is missing`).toBe(true);
    }
    for (const required of ['fullName', 'email', 'phone']) {
      expect(required in full.guest, `required guest key "${required}" is missing`).toBe(true);
    }
  });

  it('maps only backend fields a guest can see', () => {
    expect(toGuestField('guest.email')).toBe('email');
    expect(toGuestField('guest.country')).toBe('country');
    // Not a control on this form — the caller shows it form-level instead of
    // attaching it to an unrelated input.
    expect(toGuestField('lines[0].quantity')).toBeNull();
  });
});

describe('reservation request form', () => {
  it('renders the stay it is about and every required field', () => {
    form();
    const copy = requestCopy('en');
    expect(screen.getByRole('heading', { name: copy.title })).toBeTruthy();
    expect(screen.getByText('KAS Milestone Premium Hotel')).toBeTruthy();
    expect(screen.getByText(new RegExp(`${CHECK_IN}.*${CHECK_OUT}`))).toBeTruthy();
    expect(screen.getByText(/Deluxe Room × 2/)).toBeTruthy();
    for (const label of [copy.fullName, copy.email, copy.phone, copy.country]) {
      expect(screen.getByLabelText(new RegExp(label))).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: copy.submit })).toBeTruthy();
  });

  it('will not submit an empty form, and says which fields to fix', async () => {
    form();
    const copy = requestCopy('en');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(requestApi).not.toHaveBeenCalled();
    expect(screen.getByText(copy.fullNameRequired)).toBeTruthy();
    expect(screen.getByText(copy.emailRequired)).toBeTruthy();
    expect(screen.getByText(copy.phoneRequired)).toBeTruthy();
    expect(screen.getByText(copy.termsRequired)).toBeTruthy();
  });

  it('rejects an invalid email and an invalid country locally', async () => {
    form();
    const copy = requestCopy('en');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.fullName)), 'Mai');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.email)), 'mai-at-example');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.phone)), '+84901234567');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.country)), 'V1');
    await userEvent.click(screen.getByLabelText(new RegExp(copy.terms)));
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(requestApi).not.toHaveBeenCalled();
    expect(screen.getByText(copy.emailInvalid)).toBeTruthy();
    // maxLength=2 already stops a three-letter code from being typed, so the
    // reachable mistake is the shape — 'V1' is two characters and still wrong.
    expect(screen.getByText(copy.countryInvalid)).toBeTruthy();
  });

  it('requires terms acceptance even when everything else is valid', async () => {
    form();
    const copy = requestCopy('en');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.fullName)), 'Mai');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.email)), 'mai@example.com');
    await userEvent.type(screen.getByLabelText(new RegExp(copy.phone)), '+84901234567');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(requestApi).not.toHaveBeenCalled();
    expect(screen.getByText(copy.termsRequired)).toBeTruthy();
  });

  it('sends the frozen body with a UUID Idempotency-Key', async () => {
    requestApi.mockResolvedValue(receipt());
    form();
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: requestCopy('en').submit }));

    await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(1));
    const [body, key, locale] = requestApi.mock.calls[0] as [
      Record<string, unknown>,
      string,
      string,
    ];
    expect(key).toMatch(UUID_SHAPE);
    expect(locale).toBe('en');
    expect(body['propertySlug']).toBe(SLUG);
    expect(body['checkIn']).toBe(CHECK_IN);
    expect(body['adults']).toBe(2);
    expect(body['lines']).toEqual([{ roomTypeSlug: 'deluxe-room', quantity: 2 }]);
    expect(body['acceptedTermsVersion']).toBe(ACCEPTED_TERMS_VERSION);
    // Server-owned; a client cannot forge attribution or a price.
    for (const forbidden of ['leadSource', 'total', 'totalMinor', 'currency', 'partnerId']) {
      expect(forbidden in body).toBe(false);
    }
  });

  it('shows a loading state and cannot be submitted twice', async () => {
    let release: (value: unknown) => void = () => {};
    requestApi.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    form();
    const copy = requestCopy('en');
    await fillValidGuest();

    const submit = screen.getByRole('button', { name: copy.submit });
    await userEvent.click(submit);
    await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(1));

    // The impatient second and third tap, while the first is still in flight.
    const busy = screen.getByRole('button', { name: copy.submitting }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(busy);
    await userEvent.click(busy);
    expect(requestApi).toHaveBeenCalledTimes(1);

    release(receipt());
    await waitFor(() => expect(screen.getByText(copy.successTitle)).toBeTruthy());
  });

  it('reuses the SAME key when the same submission is retried after a network failure', async () => {
    requestApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.errorNetwork)).toBeTruthy());
    const firstKey = (requestApi.mock.calls[0] as [unknown, string])[1];

    requestApi.mockResolvedValueOnce(receipt());
    await userEvent.click(screen.getByRole('button', { name: copy.retry }));
    await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(2));

    // The server may already hold the reservation. The same key replays the
    // original 201 instead of taking a second set of rooms.
    expect((requestApi.mock.calls[1] as [unknown, string])[1]).toBe(firstKey);
  });

  it('takes a NEW key once the guest materially changes the request', async () => {
    requestApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(screen.getByText(copy.errorNetwork)).toBeTruthy());
    const firstKey = (requestApi.mock.calls[0] as [unknown, string])[1];

    requestApi.mockResolvedValueOnce(receipt());
    await userEvent.type(screen.getByLabelText(new RegExp(copy.phone)), '8');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(2));

    // A changed body under the old key would be 409 by doc 117 §24.1.
    expect((requestApi.mock.calls[1] as [unknown, string])[1]).not.toBe(firstKey);
  });

  it('confirms with the six public keys and claims nothing else', async () => {
    requestApi.mockResolvedValue(receipt());
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.successTitle)).toBeTruthy());
    expect(screen.getByText('KAS-260912-4F7A')).toBeTruthy();
    expect(screen.getByText('REQUEST_RECEIVED')).toBeTruthy();
    expect(screen.getByText('Within 24 hours')).toBeTruthy();
    expect(screen.getByText('Final amount is confirmed by the KAS team.')).toBeTruthy();
    // trackingUrlIssued is false, so the honest sentence appears and no tracking
    // link does. Narrowed in Step 16A.35: "no anchor at all" was a proxy for
    // "nothing claims a tracking link", and the confirmation now carries one
    // link — back to the guest's own receipt on this site, which exists whether
    // or not tracking does. The real invariant is asserted instead.
    expect(screen.getByText(copy.successNoTracking)).toBeTruthy();
    const links = [...document.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href')))
      .toEqual(['/en/requests/KAS-260912-4F7A']);

    // OQ-162 — no mail sender exists. Nothing may claim one ran.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/email sent|sent you an email|check your inbox|đã gửi email/i);
    // The form is gone, so the confirmation cannot be resubmitted.
    expect(screen.queryByRole('button', { name: copy.submit })).toBeNull();
  });

  it('attaches a 400 to the field the backend named', async () => {
    requestApi.mockRejectedValue(
      apiError(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'guest.country', code: 'Pattern', message: 'must match "^[A-Za-z]{2}$"' },
      ]),
    );
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    // The server's own words, on the server's own field — not a generic sorry.
    await waitFor(() => expect(screen.getByText('must match "^[A-Za-z]{2}$"')).toBeTruthy());
    expect(screen.getByText(copy.fixFields)).toBeTruthy();
    expect(screen.queryByText(copy.successTitle)).toBeNull();
  });

  it('treats 409 IDEMPOTENCY_KEY_REUSED as a recoverable error, never a success', async () => {
    requestApi.mockRejectedValue(
      apiError(409, 'IDEMPOTENCY_KEY_REUSED', 'This key was used for a different request.'),
    );
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.errorKeyReused)).toBeTruthy());
    expect(screen.queryByText(copy.successTitle)).toBeNull();
    // Not retried behind the guest's back, and no second key was minted.
    expect(requestApi).toHaveBeenCalledTimes(1);
  });

  it('explains a 422 NO_AVAILABILITY and renders no alternatives', async () => {
    requestApi.mockRejectedValue(
      apiError(422, 'NO_AVAILABILITY', 'deluxe-room: 2 requested, 0 available for the stay', [
        { field: null, code: 'NO_AVAILABILITY', message: 'deluxe-room 2 → 0' },
      ]),
    );
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.errorNoAvailability)).toBeTruthy());
    // Doc 120 §2 — alternatives are out of V1 scope. Nothing invents nearest
    // dates, other properties, or an empty list implying the server looked.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/nearest|other propert|alternative|ngày gần|khách sạn khác/i);
    // The room type slug in the backend's own message is not shown to a guest.
    expect(text).not.toMatch(/deluxe-room/);
  });

  it('handles a 404 without re-describing it as a permission problem', async () => {
    requestApi.mockRejectedValue(apiError(404, 'NOT_FOUND', 'Property is out of scope.'));
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.errorNotFound)).toBeTruthy());
    // Doc 85 §6.3 — 404 hides existence; saying "not permitted" would leak it.
    expect(document.body.textContent ?? '').not.toMatch(/permission|not allowed|forbidden/i);
  });

  it('shows a correlation id for support and never a stack trace', async () => {
    requestApi.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'Something went wrong.'));
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.errorServer)).toBeTruthy());
    expect(screen.getByText(copy.reference('corr-123'))).toBeTruthy();
  });

  it('keeps what the guest typed when a submission fails', async () => {
    requestApi.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'Something went wrong.'));
    form();
    const copy = requestCopy('en');
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(screen.getByText(copy.errorServer)).toBeTruthy());
    expect((screen.getByLabelText(new RegExp(copy.fullName)) as HTMLInputElement).value)
      .toBe('Mai Tran');
    expect((screen.getByLabelText(new RegExp(copy.email)) as HTMLInputElement).value)
      .toBe('mai@example.com');
  });

  it('associates every error with its control and does not rely on colour', async () => {
    form();
    const copy = requestCopy('en');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));

    const email = screen.getByLabelText(new RegExp(copy.email));
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toContain('guest-email-error');
    const terms = screen.getByLabelText(new RegExp(copy.terms));
    expect(terms.getAttribute('aria-describedby')).toBe('guest-terms-error');
    // The message is text, readable without seeing the tint.
    expect(screen.getByText(copy.termsRequired)).toBeTruthy();
  });

  it('offers no child, offer-code or price control', () => {
    form();
    // B10 and B23 are OPEN and the backend refuses both, so the form must not
    // invite either — and a guest may never author a price.
    expect(screen.queryByLabelText(/child|trẻ em/i)).toBeNull();
    // 'offer code', not merely the word 'offers' — the marketing consent line
    // legitimately mentions offers and is not an input for one.
    expect(screen.queryByLabelText(/offer code|voucher|mã giảm giá/i)).toBeNull();
    expect(screen.queryByLabelText(/total|price|giá/i)).toBeNull();
  });
});

describe('guest privacy', () => {
  it('puts no guest detail in storage, the URL or the console', async () => {
    const logged: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => { logged.push(a); });
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => { logged.push(a); });
    requestApi.mockResolvedValue(receipt());
    form();
    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: requestCopy('en').submit }));
    await waitFor(() => expect(screen.getByText('KAS-260912-4F7A')).toBeTruthy());

    // The same guard the rest of the guest surface carries: nothing persists.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    // Name, email, phone and the idempotency key are all absent from the URL —
    // the endpoint sends only `locale` as a query parameter.
    const url = window.location.href;
    for (const secret of ['Mai', 'mai@example.com', '84', 'Idempotency']) {
      expect(url).not.toContain(secret);
    }

    // And nothing was logged at all, let alone a guest's details.
    expect(logged).toEqual([]);
    spy.mockRestore();
    warn.mockRestore();
  });
});

describe('localisation', () => {
  it('renders English', () => {
    form('en');
    expect(screen.getByRole('heading', { name: 'Request this stay' })).toBeTruthy();
    expect(screen.getByLabelText(/Full name/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
  });

  it('renders Vietnamese', () => {
    form('vi');
    expect(screen.getByRole('heading', { name: 'Gửi yêu cầu đặt phòng' })).toBeTruthy();
    expect(screen.getByLabelText(/Họ và tên/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu' })).toBeTruthy();
  });

  it('keeps both locales at parity, so neither can drift', () => {
    const en = requestCopy('en') as unknown as Record<string, unknown>;
    const vi = requestCopy('vi') as unknown as Record<string, unknown>;
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(typeof vi[key]).toBe(typeof en[key]);
      if (typeof en[key] === 'string') {
        expect((vi[key] as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('reports a validation failure in the guest’s own language', async () => {
    form('vi');
    const copy = requestCopy('vi');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(screen.getByText(copy.fullNameRequired)).toBeTruthy();
    expect(screen.getByText(copy.termsRequired)).toBeTruthy();
  });
});

describe('responsive sanity', () => {
  it('gives every summary value and the reference room to wrap', async () => {
    requestApi.mockResolvedValue(receipt());
    const { container } = form();

    // A long hotel name, a long room list and the reference are the three
    // strings that can exceed a 320px screen. Each is allowed to wrap rather
    // than push the card sideways.
    const summaryValues = container.querySelectorAll('dd');
    expect(summaryValues.length).toBeGreaterThan(0);

    await fillValidGuest();
    await userEvent.click(screen.getByRole('button', { name: requestCopy('en').submit }));
    await waitFor(() => expect(screen.getByText('KAS-260912-4F7A')).toBeTruthy());

    // No fixed pixel widths anywhere in the new markup — the layout is grid and
    // token-driven, so a narrow viewport reflows instead of clipping the CTA.
    expect(container.querySelector('[style*="width"]')).toBeNull();
  });
});
