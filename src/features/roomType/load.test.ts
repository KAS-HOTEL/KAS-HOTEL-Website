import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { RoomTypeView } from '@/lib/domain/roomType';

const list = vi.fn();
const get = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  roomTypesApi: {
    list: (...args: unknown[]) => list(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

const { loadRoomTypeDetail, loadRoomTypes } = await import('./load');

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const ROOM_A = '33333333-3333-4333-8333-333333333333';
const ROOM_B = '44444444-4444-4444-8444-444444444444';

const roomType: RoomTypeView = {
  id: ROOM_A,
  slug: 'room-alpha',
  translations: { vi: { name: 'Phòng Alpha' } },
  status: 'DRAFT',
  maxAdults: 2,
  maxChildren: 0,
  maxOccupancy: 2,
  smoking: false,
  sortOrder: 0,
  beds: [],
  amenityCodes: [],
  version: 0,
};

function apiError(status: number, code: string): ApiError {
  return new ApiError(status, { code, message: 'x', details: [], correlationId: 'corr-1' });
}

beforeEach(() => {
  list.mockReset();
  get.mockReset();
});

describe('loadRoomTypes', () => {
  it('returns whatever the backend returned, in its order', async () => {
    const rooms = [roomType, { ...roomType, id: ROOM_B, slug: 'room-beta' }];
    list.mockResolvedValue(rooms);

    const result = await loadRoomTypes(PROPERTY_A, 'kas_access=x');

    expect(result).toEqual({ status: 'ok', roomTypes: rooms });
    expect(list).toHaveBeenCalledWith(PROPERTY_A, 'kas_access=x');
  });

  it('treats an empty list as success — every seed property is in that state', async () => {
    list.mockResolvedValue([]);
    expect(await loadRoomTypes(PROPERTY_A)).toEqual({ status: 'ok', roomTypes: [] });
  });

  it('answers a malformed property id without asking the backend', async () => {
    const result = await loadRoomTypes('not-a-uuid');

    expect(result).toEqual({ status: 'ok', roomTypes: [] });
    expect(list).not.toHaveBeenCalled();
  });

  it('surfaces an API failure as an error state', async () => {
    list.mockRejectedValue(apiError(403, 'FORBIDDEN'));

    const result = await loadRoomTypes(PROPERTY_A);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.status).toBe(403);
    }
  });

  it('turns an unreachable service into an ApiError rather than throwing', async () => {
    list.mockRejectedValue(new TypeError('fetch failed'));

    const result = await loadRoomTypes(PROPERTY_A);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.status).toBe(0);
    }
  });
});

describe('loadRoomTypeDetail', () => {
  it('returns the room type', async () => {
    get.mockResolvedValue(roomType);

    const result = await loadRoomTypeDetail(PROPERTY_A, ROOM_A, 'kas_access=x');

    expect(result).toEqual({ status: 'ok', roomType });
    expect(get).toHaveBeenCalledWith(PROPERTY_A, ROOM_A, 'kas_access=x');
  });

  it('maps a 404 to notFound', async () => {
    get.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    expect(await loadRoomTypeDetail(PROPERTY_A, ROOM_A)).toEqual({ status: 'notFound' });
  });

  it('gives another partner’s room type the identical notFound answer', async () => {
    // Doc 85 §6.3 — and it matters more here than for properties, because a room
    // type now carries a Partner-authored name a person would recognise.
    get.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const absent = await loadRoomTypeDetail(PROPERTY_A, ROOM_A);

    get.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const otherPartner = await loadRoomTypeDetail(PROPERTY_B, ROOM_B);

    expect(otherPartner).toEqual(absent);
    expect(otherPartner).toEqual({ status: 'notFound' });
  });

  it('answers a malformed id of either kind without asking the backend', async () => {
    expect(await loadRoomTypeDetail('nope', ROOM_A)).toEqual({ status: 'notFound' });
    expect(await loadRoomTypeDetail(PROPERTY_A, 'nope')).toEqual({ status: 'notFound' });
    expect(get).not.toHaveBeenCalled();
  });

  it('never turns a permission failure into notFound', async () => {
    // A 403 means the account lacks roomtype.manage — a real misconfiguration,
    // and a different problem from a missing room.
    get.mockRejectedValue(apiError(403, 'FORBIDDEN'));

    const result = await loadRoomTypeDetail(PROPERTY_A, ROOM_A);

    expect(result.status).toBe('error');
  });

  it('surfaces an unreachable backend as an error, not as not-found', async () => {
    get.mockRejectedValue(new TypeError('fetch failed'));

    const result = await loadRoomTypeDetail(PROPERTY_A, ROOM_A);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.status).toBe(0);
    }
  });
});
