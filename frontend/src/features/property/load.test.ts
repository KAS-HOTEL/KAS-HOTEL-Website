import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView } from '@/lib/domain/property';

const list = vi.fn();
const get = vi.fn();
const completeness = vi.fn();
const history = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: {
    list: (...args: unknown[]) => list(...args),
    get: (...args: unknown[]) => get(...args),
    completeness: (...args: unknown[]) => completeness(...args),
  },
  submissionsApi: {
    history: (...args: unknown[]) => history(...args),
  },
}));

const { isPropertyId, loadPropertyDetail, loadPropertyList } = await import('./load');

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';

/** A synthetic record. Deliberately not one of the eight seed slugs. */
const property: PropertyAdminView = {
  id: PROPERTY_A,
  slug: 'hotel-alpha',
  names: { vi: 'Khách sạn Alpha', en: 'Alpha Hotel' },
  signatureLines: {},
  shortDescriptions: {},
  amenityCodes: [],
    tripIntentCodes: [],
  lifecycleState: 'DRAFT',
  isFlagship: false,
  city: 'Ho Chi Minh City',
  sortOrder: 1,
  version: 3,
};

function apiError(status: number, code: string): ApiError {
  return new ApiError(status, { code, message: 'x', details: [], correlationId: 'corr-1' });
}

beforeEach(() => {
  list.mockReset();
  get.mockReset();
  completeness.mockReset();
  history.mockReset();
  // Detail reads it on every call; individual tests override where it matters.
  history.mockResolvedValue([]);
});

describe('loadPropertyList', () => {
  it('returns whatever the backend returned, unfiltered and uncounted', async () => {
    const many = Array.from({ length: 3 }, (_, index) => ({
      ...property,
      id: `${index}`,
      slug: `hotel-${index}`,
    }));
    list.mockResolvedValue(many);

    const result = await loadPropertyList('kas_access=x');

    expect(result).toEqual({ status: 'ok', properties: many });
    expect(list).toHaveBeenCalledWith('kas_access=x');
  });

  it('reports an empty scope as success, not as an error', async () => {
    list.mockResolvedValue([]);
    const result = await loadPropertyList();
    // "You have no hotels" and "we could not ask" are different facts.
    expect(result).toEqual({ status: 'ok', properties: [] });
  });

  it('surfaces an API failure as an error state', async () => {
    list.mockRejectedValue(apiError(403, 'FORBIDDEN'));

    const result = await loadPropertyList();

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.status).toBe(403);
    }
  });

  it('turns an unreachable service into an ApiError rather than throwing', async () => {
    // A DNS failure or refused connection never reaches the backend's exception
    // handler, so it has no doc 58 body — it still has to become one type.
    list.mockRejectedValue(new TypeError('fetch failed'));

    const result = await loadPropertyList();

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.status).toBe(0);
      expect(result.error.correlationId).toBeNull();
    }
  });
});

describe('isPropertyId', () => {
  it('accepts a UUID and rejects anything that cannot name a property', () => {
    expect(isPropertyId(PROPERTY_A)).toBe(true);
    expect(isPropertyId('not-a-uuid')).toBe(false);
    expect(isPropertyId('')).toBe(false);
    expect(isPropertyId('../../etc/passwd')).toBe(false);
    expect(isPropertyId(`${PROPERTY_A} `)).toBe(false);
  });
});

describe('loadPropertyDetail', () => {
  it('returns the property together with its completeness and review history', async () => {
    get.mockResolvedValue(property);
    completeness.mockResolvedValue({ sections: [], complete: false });
    history.mockResolvedValue([{ id: 's-1', propertyId: PROPERTY_A, status: 'SUBMITTED' }]);

    const result = await loadPropertyDetail(PROPERTY_A, 'kas_access=x');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.property).toEqual(property);
      expect(result.completeness).toEqual({ sections: [], complete: false });
      expect(result.history).toEqual([
        { id: 's-1', propertyId: PROPERTY_A, status: 'SUBMITTED' },
      ]);
    }
  });

  it('still renders the property when the review history fails', async () => {
    get.mockResolvedValue(property);
    completeness.mockResolvedValue({ sections: [], complete: false });
    history.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));

    const result = await loadPropertyDetail(PROPERTY_A);

    // Null, not []. "We could not ask" is a different fact from "never
    // submitted", and the submit panel acts on only one of them.
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.history).toBeNull();
    }
  });

  it('maps a 404 to notFound', async () => {
    get.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    expect(await loadPropertyDetail(PROPERTY_A)).toEqual({ status: 'notFound' });
  });

  it('gives another partner’s property the identical notFound answer', async () => {
    // Doc 85 §6.3: the backend answers 404 rather than 403 so the existence of
    // another partner's records is never disclosed. The two calls below are
    // indistinguishable to the caller, which is the entire contract.
    get.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const absent = await loadPropertyDetail(PROPERTY_A);

    get.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const otherPartner = await loadPropertyDetail(PROPERTY_B);

    expect(otherPartner).toEqual(absent);
    expect(otherPartner).toEqual({ status: 'notFound' });
  });

  it('answers a malformed id without asking the backend at all', async () => {
    const result = await loadPropertyDetail('definitely-not-a-uuid');

    expect(result).toEqual({ status: 'notFound' });
    // The backend would answer 400 VALIDATION_FAILED for an unparseable path
    // variable, which is not a state this screen should render.
    expect(get).not.toHaveBeenCalled();
  });

  it('never turns a permission failure into notFound', async () => {
    // A 403 means the account lacks property.manage entirely — a different
    // problem from a missing hotel, and hiding it would hide a real misconfiguration.
    get.mockRejectedValue(apiError(403, 'FORBIDDEN'));

    const result = await loadPropertyDetail(PROPERTY_A);

    expect(result.status).toBe('error');
  });

  it('still renders the property when completeness fails', async () => {
    get.mockResolvedValue(property);
    completeness.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));

    const result = await loadPropertyDetail(PROPERTY_A);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.completeness).toBeNull();
    }
  });

  it('does not let a completeness 404 make a found property disappear', async () => {
    get.mockResolvedValue(property);
    completeness.mockRejectedValue(apiError(404, 'NOT_FOUND'));

    const result = await loadPropertyDetail(PROPERTY_A);

    expect(result.status).toBe('ok');
  });

  it('forwards the caller’s cookie header to every call', async () => {
    get.mockResolvedValue(property);
    completeness.mockResolvedValue({ sections: [], complete: true });

    await loadPropertyDetail(PROPERTY_A, 'kas_access=abc');

    // A Server Component has no browser to attach HttpOnly cookies; forgetting
    // this is how a page silently becomes anonymous and 401s.
    expect(get).toHaveBeenCalledWith(PROPERTY_A, 'kas_access=abc');
    expect(completeness).toHaveBeenCalledWith(PROPERTY_A, 'kas_access=abc');
    expect(history).toHaveBeenCalledWith(PROPERTY_A, 'kas_access=abc');
  });
});
