// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh, push: vi.fn() }) }));

const refreshCall = vi.fn<() => Promise<void>>();
vi.mock('@/lib/api/endpoints', () => ({ authApi: { refresh: () => refreshCall() } }));

const { SessionKeepAlive } = await import('./SessionKeepAlive');
const { SessionRenewal } = await import('./SessionRenewal');
const { resetRefreshState } = await import('@/lib/api/refresh');

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  refreshCall.mockReset();
  resetRefreshState();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('keeping a console session alive', () => {
  it('renews every interval while the tab is visible, and never signs out on failure', async () => {
    vi.useFakeTimers();
    refreshCall.mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    render(<SessionKeepAlive intervalMs={1000} />);
    expect(refreshCall).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(refreshCall).toHaveBeenCalledTimes(2);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('silent renewal on the sign-in page', () => {
  it('goes straight back when the refresh cookie is still valid', async () => {
    refreshCall.mockResolvedValue(undefined);
    render(
      <SessionRenewal returnTo="/admin/vouchers" attempt>
        <p>form</p>
      </SessionRenewal>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/khôi phục/);
    await act(async () => { await Promise.resolve(); });
    expect(replace).toHaveBeenCalledWith('/admin/vouchers');
    expect(screen.queryByText('form')).toBeNull();
  });

  it('shows the form with a plain notice when the session has really ended', async () => {
    refreshCall.mockRejectedValue(new Error('401'));
    render(
      <SessionRenewal returnTo="/partner" attempt>
        <p>form</p>
      </SessionRenewal>,
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('form')).toBeTruthy();
    expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not try at all after a deliberate sign-out (no returnTo)', () => {
    render(
      <SessionRenewal returnTo="/admin" attempt={false}>
        <p>form</p>
      </SessionRenewal>,
    );
    expect(screen.getByText('form')).toBeTruthy();
    expect(refreshCall).not.toHaveBeenCalled();
  });
});
