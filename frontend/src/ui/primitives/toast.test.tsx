// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastTone } from './Toast';

/**
 * How long a toast stays.
 *
 * <h2>The behaviour this pins</h2>
 *
 * Nothing dismissed itself before. Uploading five room photographs left five
 * "đã tải lên" cards over the gallery until each was closed by hand — a chore
 * charged to the operator for the crime of succeeding.
 *
 * <p>Confirmations now retire after three seconds. Failures do not, and that
 * asymmetry is the part most at risk of being "tidied" later: an error carries
 * the correlation id support asks for, and timing out the only copy of it would
 * mean reproducing the fault to get it back.
 *
 * <h2>`fireEvent`, not `userEvent`</h2>
 *
 * `userEvent` runs its own scheduler, which deadlocks against fake timers here.
 * These tests are about a `setTimeout`, so the clock has to be the fake one and
 * the clicks have to be plain dispatches.
 */

/** Shows whatever the case asks for, on demand. */
function Harness({ calls }: { readonly calls: readonly (readonly [ToastTone, string])[] }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => calls.forEach(([tone, message]) => toast.show(tone, message))}
    >
      fire
    </button>
  );
}

function showToasts(calls: readonly (readonly [ToastTone, string])[]) {
  render(
    <ToastProvider>
      <Harness calls={calls} />
    </ToastProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
  });
}

/** Advances the fake clock inside `act`, so React flushes what it triggers. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const closers = () => screen.queryAllByRole('button', { name: 'Đóng thông báo' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('toast lifecycle', () => {
  it('retires a success on its own after about three seconds', () => {
    showToasts([['success', 'Đã tải ảnh lên.']]);
    expect(screen.getByText('Đã tải ảnh lên.')).toBeTruthy();

    // Still there just before the interval — a toast that vanished at 2.9s would
    // be unreadable, and one that never left is the defect this replaces.
    advance(2900);
    expect(screen.queryByText('Đã tải ảnh lên.')).toBeTruthy();

    advance(200);
    expect(screen.queryByText('Đã tải ảnh lên.')).toBeNull();
  });

  it('retires an info toast the same way', () => {
    showToasts([['info', 'Đang đồng bộ.']]);

    advance(3100);
    expect(screen.queryByText('Đang đồng bộ.')).toBeNull();
  });

  it('keeps an error until it is read', () => {
    showToasts([['error', 'Không lưu được.']]);

    // Ten times the success interval. A failure carries the reference support
    // will ask for; it waits for the person, not for a clock.
    advance(30_000);
    expect(screen.getByText('Không lưu được.')).toBeTruthy();
  });

  it('keeps a warning until it is read', () => {
    showToasts([['warning', 'Đã tạo nhưng chưa lưu địa chỉ.']]);

    advance(30_000);
    expect(screen.getByText('Đã tạo nhưng chưa lưu địa chỉ.')).toBeTruthy();
  });

  it('still closes immediately when the X is pressed', () => {
    showToasts([['success', 'Đã lưu.']]);

    act(() => {
      fireEvent.click(closers()[0] as HTMLElement);
    });

    // Without advancing a single millisecond.
    expect(screen.queryByText('Đã lưu.')).toBeNull();
  });

  it('closes an error by hand, which is the only way one goes', () => {
    showToasts([['error', 'Không lưu được.']]);

    act(() => {
      fireEvent.click(closers()[0] as HTMLElement);
    });

    expect(screen.queryByText('Không lưu được.')).toBeNull();
  });

  it('leaves nothing behind after a run of successes', () => {
    showToasts([
      ['success', 'Ảnh 1'],
      ['success', 'Ảnh 2'],
      ['success', 'Ảnh 3'],
    ]);
    expect(closers()).toHaveLength(3);

    // The acceptance criterion: rapid successive successful actions leave no
    // permanent clutter.
    advance(3100);
    expect(closers()).toHaveLength(0);
  });

  it('caps the stack so a failing loop cannot paper over the screen', () => {
    showToasts([
      ['error', 'Lỗi 1'],
      ['error', 'Lỗi 2'],
      ['error', 'Lỗi 3'],
      ['error', 'Lỗi 4'],
      ['error', 'Lỗi 5'],
      ['error', 'Lỗi 6'],
    ]);

    // Errors never expire, so the cap is the only thing bounding them.
    expect(closers()).toHaveLength(4);
    // The newest survive: the most recent failure is the one still worth acting on.
    expect(screen.queryByText('Lỗi 1')).toBeNull();
    expect(screen.getByText('Lỗi 6')).toBeTruthy();
  });

  it('stops the clock while the pointer is over the toast', () => {
    showToasts([['success', 'Mã tham chiếu ở đây.']]);

    const card = closers()[0]?.parentElement as HTMLElement;
    act(() => {
      fireEvent.mouseEnter(card);
    });

    // Hovering must hold it: a message being copied from must not vanish
    // mid-selection.
    advance(5000);
    expect(screen.getByText('Mã tham chiếu ở đây.')).toBeTruthy();

    // And letting go lets it go.
    act(() => {
      fireEvent.mouseLeave(card);
    });
    advance(3100);
    expect(screen.queryByText('Mã tham chiếu ở đây.')).toBeNull();
  });
});
