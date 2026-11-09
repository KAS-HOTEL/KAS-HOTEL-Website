// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const update = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  paymentAccountApi: {
    get: (...args: unknown[]) => get(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));

const { PaymentAccountEditor } = await import('./PaymentAccountEditor');

describe('the shared KAS payment account (V51)', () => {
  beforeEach(() => {
    get.mockResolvedValue({
      qrImageUrl: 'https://example.invalid/qr.png', instructions: 'Ghi mã đặt phòng',
      bankName: 'Vietcombank', accountHolder: 'CONG TY KAS', accountNumber: '0123456789',
    });
    update.mockImplementation((body: unknown) => Promise.resolve(body));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows the saved account', async () => {
    render(<PaymentAccountEditor />);
    expect(await screen.findByDisplayValue('Vietcombank')).toBeTruthy();
    expect(screen.getByDisplayValue('CONG TY KAS')).toBeTruthy();
    expect(screen.getByDisplayValue('0123456789')).toBeTruthy();
  });

  it('sends the details trimmed, and an emptied field as null', async () => {
    const user = userEvent.setup();
    render(<PaymentAccountEditor />);
    const bank = await screen.findByLabelText('Ngân hàng');
    await user.clear(bank);
    await user.type(bank, '  ACB  ');
    await user.clear(screen.getByLabelText('Chủ tài khoản'));
    await user.click(screen.getByRole('button', { name: 'Lưu tài khoản thanh toán' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      qrImageUrl: 'https://example.invalid/qr.png', instructions: 'Ghi mã đặt phòng',
      bankName: 'ACB', accountHolder: null, accountNumber: '0123456789',
    });
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('says so when the account cannot be loaded', async () => {
    get.mockRejectedValue(new Error('offline'));
    render(<PaymentAccountEditor />);
    expect((await screen.findByRole('alert')).textContent).toContain('Không tải được tài khoản thanh toán');
  });
});
