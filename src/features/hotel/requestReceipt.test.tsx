// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { RequestReceipt } from '@/lib/domain/reservationRequest';

const receiptApi = vi.fn();
const notFoundSpy = vi.fn();

vi.mock('next/navigation', () => ({ notFound: () => notFoundSpy() }));
vi.mock('@/lib/api/endpoints', () => ({
  reservationsApi: { receipt: (...args: unknown[]) => receiptApi(...args) },
}));

const { RequestConfirmation } = await import('./RequestConfirmation');
const { requestCopy } = await import('./requestMessages');
const { loadReceipt } = await import('./load');
const PageModule = await import('@/app/[locale]/requests/[reference]/page');

const REFERENCE = 'KAS-260912-4F7A';

function receipt(overrides: Partial<RequestReceipt> = {}): RequestReceipt {
  return {
    reference: REFERENCE,
    status: 'REQUEST_RECEIVED',
    responsePromise: 'Within 24 hours',
    trackingUrlIssued: false,
    estimatedTotal: { amountMinor: 3_700_000, currency: 'VND', exponent: 0 },
    estimateDisclaimer: 'Final amount is confirmed by the KAS team.',
    ...overrides,
  };
}

async function renderPage(locale = 'en', reference = REFERENCE) {
  const element = await PageModule.default({
    params: Promise.resolve({ locale, reference }),
  });
  return render(element);
}

afterEach(cleanup);
beforeEach(() => {
  receiptApi.mockReset();
  notFoundSpy.mockReset();
  notFoundSpy.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
});

describe('the loader', () => {
  it('returns the receipt the backend served', async () => {
    receiptApi.mockResolvedValue(receipt());

    await expect(loadReceipt(REFERENCE)).resolves.toEqual({
      status: 'ok',
      receipt: receipt(),
    });
    expect(receiptApi).toHaveBeenCalledWith(REFERENCE);
  });

  it('turns a 404 into notFound, not an error', async () => {
    // A reference never issued a receipt and a mistyped one are the same answer:
    // a reference is an identifier, never a credential (doc 85 §6.3).
    receiptApi.mockRejectedValue(new ApiError(404, {
      code: 'NOT_FOUND', message: 'Request not found', details: [], correlationId: 'c1',
    }));

    await expect(loadReceipt(REFERENCE)).resolves.toEqual({ status: 'notFound' });
  });

  it('surfaces a real backend failure as an error', async () => {
    receiptApi.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c2',
    }));

    const result = await loadReceipt(REFERENCE);
    expect(result.status).toBe('error');
  });
});

describe('the reopened receipt page', () => {
  it('renders the receipt fetched from the backend', async () => {
    receiptApi.mockResolvedValue(receipt());

    await renderPage('en');

    expect(screen.getByText(REFERENCE)).toBeTruthy();
    expect(screen.getByText('REQUEST_RECEIVED')).toBeTruthy();
    expect(screen.getByText('Within 24 hours')).toBeTruthy();
    expect(screen.getByText(/3.700.000/)).toBeTruthy();
    expect(screen.getByText('Final amount is confirmed by the KAS team.')).toBeTruthy();
  });

  it('reads the reference out of the route, so a reload recovers it', async () => {
    receiptApi.mockResolvedValue(receipt({ reference: 'KAS-260913-9B02' }));

    await renderPage('en', 'KAS-260913-9B02');

    // The whole point: nothing came from client memory.
    expect(receiptApi).toHaveBeenCalledWith('KAS-260913-9B02');
    expect(screen.getByText('KAS-260913-9B02')).toBeTruthy();
  });

  it('is the same component the submission renders', async () => {
    receiptApi.mockResolvedValue(receipt());
    const { container: reopened } = await renderPage('en');
    const reopenedText = reopened.textContent;
    cleanup();

    const { container: fresh } = render(
      <RequestConfirmation receipt={receipt()} copy={requestCopy('en')} locale="en" />,
    );

    // A reopened receipt and a fresh one cannot drift apart, because they are
    // the same component fed the same shape.
    expect(reopenedText).toContain(fresh.textContent);
  });

  it('renders in the reader’s locale', async () => {
    receiptApi.mockResolvedValue(receipt());

    await renderPage('vi');

    expect(screen.getByText(requestCopy('vi').successTitle)).toBeTruthy();
  });

  it('is notFound for an unknown reference', async () => {
    receiptApi.mockRejectedValue(new ApiError(404, {
      code: 'NOT_FOUND', message: 'Request not found', details: [], correlationId: 'c3',
    }));

    await expect(renderPage('en', 'KAS-000000-0000')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundSpy).toHaveBeenCalled();
  });

  it('is notFound for an unsupported locale, and never asks the backend', async () => {
    await expect(renderPage('fr')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(receiptApi).not.toHaveBeenCalled();
  });

  it('shows the guest error state when the backend fails', async () => {
    receiptApi.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'stack trace', details: [], correlationId: 'c4',
    }));

    await renderPage('en');

    expect(screen.getByText(requestCopy('en').receiptErrorTitle)).toBeTruthy();
    // The guest mapping: backend words only for 400 and 422, one constant otherwise.
    expect(document.body.textContent).not.toContain('stack trace');
  });

  it('discloses nothing beyond the receipt', async () => {
    receiptApi.mockResolvedValue(receipt());

    const { container } = await renderPage('en');

    // The route takes a bare reference, so what it renders must be safe to hand
    // anyone holding one.
    expect(container.textContent).not.toMatch(
      /guestName|guestEmail|reservationId|propertyId|partnerId|salesStatus/i,
    );
  });
});

describe('the link back to the receipt', () => {
  it('offers a real link to the reference', () => {
    render(<RequestConfirmation receipt={receipt()} copy={requestCopy('en')} locale="en" />);

    // The receipt is recoverable from the server, so give the guest the address
    // rather than asking them to reconstruct it.
    const link = screen.getByRole('link', { name: requestCopy('en').successOpenReceipt });
    expect(link.getAttribute('href')).toBe(`/en/requests/${REFERENCE}`);
  });

  it('keeps the locale prefix doc 22 §3 requires', () => {
    render(<RequestConfirmation receipt={receipt()} copy={requestCopy('vi')} locale="vi" />);

    expect(screen.getByRole('link', { name: requestCopy('vi').successOpenReceipt })
      .getAttribute('href')).toBe(`/vi/requests/${REFERENCE}`);
  });

  it('appears on the reopened receipt too, so the address survives a share', async () => {
    receiptApi.mockResolvedValue(receipt());

    await renderPage('en');

    expect(screen.getByRole('link', { name: requestCopy('en').successOpenReceipt })
      .getAttribute('href')).toBe(`/en/requests/${REFERENCE}`);
  });
});

describe('the confirmation itself is unchanged', () => {
  it('still says nothing was sent, because nothing was', () => {
    render(<RequestConfirmation receipt={receipt()} copy={requestCopy('en')} locale="en" />);

    // trackingUrlIssued is the backend's own flag — OQ-162 — and this reads it
    // rather than claiming an email went out.
    expect(screen.getByText(requestCopy('en').successNoTracking)).toBeTruthy();
  });

  it('omits the no-tracking note once a tracking link exists', () => {
    render(<RequestConfirmation receipt={receipt({ trackingUrlIssued: true })} copy={requestCopy('en')} locale="en" />);

    expect(screen.queryByText(requestCopy('en').successNoTracking)).toBeNull();
  });
});
