import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Session resolution: the three-state model.
 *
 * The state that matters most is `unavailable`. Collapsing it into `anonymous`
 * would tell a user with a perfectly valid session that they had been logged
 * out, every time the API hiccuped.
 */

const listMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'kas_access=opaque' }),
}));

vi.mock('../api/endpoints', () => ({
  sessionApi: { list: (...args: unknown[]) => listMock(...args) },
  authApi: {},
}));

beforeEach(() => {
  vi.resetModules();
  listMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadSession() {
  return import('./session');
}

describe('resolveSession', () => {
  it('reports authenticated when the backend answers', async () => {
    listMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const { resolveSession } = await loadSession();

    await expect(resolveSession()).resolves.toEqual({
      status: 'authenticated',
      sessionCount: 2,
    });
  });

  it('reports anonymous on 401', async () => {
    const { ApiError } = await import('../api/errors');
    listMock.mockRejectedValue(
      new ApiError(401, {
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required.',
        details: [],
        correlationId: null,
      }),
    );
    const { resolveSession } = await loadSession();

    await expect(resolveSession()).resolves.toEqual({ status: 'anonymous' });
  });

  it('reports unavailable on a backend failure — never "logged out"', async () => {
    const { ApiError } = await import('../api/errors');
    listMock.mockRejectedValue(
      new ApiError(503, {
        code: 'AVAILABILITY_UNAVAILABLE',
        message: 'x',
        details: [],
        correlationId: 'corr-1',
      }),
    );
    const { resolveSession } = await loadSession();

    await expect(resolveSession()).resolves.toEqual({
      status: 'unavailable',
      correlationId: 'corr-1',
    });
  });

  it('reports unavailable when the request never reached the backend', async () => {
    listMock.mockRejectedValue(new TypeError('fetch failed'));
    const { resolveSession } = await loadSession();

    await expect(resolveSession()).resolves.toEqual({
      status: 'unavailable',
      correlationId: null,
    });
  });

  it('forwards the caller cookie header so the backend can identify the session', async () => {
    listMock.mockResolvedValue([]);
    const { resolveSession } = await loadSession();

    await resolveSession();

    // A Server Component has no browser to attach cookies; without this the
    // probe would always look anonymous.
    expect(listMock).toHaveBeenCalledWith('kas_access=opaque');
  });
});
