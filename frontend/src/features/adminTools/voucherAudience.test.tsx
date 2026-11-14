// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/* 2026-11-14: a voucher for everyone, some member tiers or chosen customers; it starts when created. */
const calls = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), tiers: vi.fn(), search: vi.fn() }));
vi.mock('@/lib/api/endpoints/adminTools', () => ({
  ADMIN_LIST_PAGE_SIZE: 50,
  vouchersApi: { list: calls.list, create: calls.create, setStatus: vi.fn(), tiers: calls.tiers, searchCustomers: calls.search },
}));
import { VoucherManager, formatHotelTime } from './VoucherManager';

const CREATED = { id: 'v9', code: 'KAS-TARGET99', name: 'VIP', type: 'PERCENTAGE', valuePercent: 20, currency: 'VND', usedCount: 0, stackable: false, status: 'DRAFT' };

beforeEach(() => {
  vi.resetAllMocks();
  calls.list.mockResolvedValue([]);
  calls.create.mockResolvedValue(CREATED);
  calls.tiers.mockResolvedValue([{ id: 't-gold', code: 'GOLD', name: 'Vàng' }, { id: 't-plat', code: 'PLATINUM', name: 'Bạch kim' }]);
  calls.search.mockResolvedValue([{ id: 'c1', customerCode: 'KAS-674E22A3E859', fullName: 'Đinh Thị Anh Thư', email: 'thu@example.invalid' }]);
});
afterEach(cleanup);

async function openForm() {
  render(<VoucherManager />);
  await screen.findByText('Không có voucher phù hợp');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
  const dialog = screen.getByRole('dialog', { name: 'Tạo voucher' });
  await userEvent.type(within(dialog).getByLabelText('Tên voucher'), 'VIP');
  await userEvent.type(within(dialog).getByLabelText('Giá trị giảm (%)'), '20');
  return dialog;
}

it('has no start date: it starts when created; the end is a date and time in hotel time', async () => {
  const dialog = await openForm();
  expect(dialog.querySelector('input[name="validFrom"]')).toBeNull();
  expect(within(dialog).getByText(/Bắt đầu: ngay khi bấm Tạo voucher/)).toBeTruthy();
  const end = within(dialog).getByLabelText('Ngày giờ kết thúc');
  await userEvent.type(end, '2099-12-31T18:30');
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
  expect(calls.create.mock.calls[0]?.[0]).toMatchObject({ audience: 'ALL', validToAt: '2099-12-31T18:30:00+07:00' });
  expect(calls.create.mock.calls[0]?.[0]).not.toHaveProperty('validFrom');
});

it('targets member tiers, and refuses none', async () => {
  const dialog = await openForm();
  await userEvent.click(within(dialog).getByLabelText('Theo hạng thành viên'));
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  expect((await within(dialog).findByRole('alert')).textContent).toContain('Chọn ít nhất một hạng');
  expect(calls.create).not.toHaveBeenCalled();
  await userEvent.click(await within(dialog).findByLabelText('Vàng'));
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
  expect(calls.create.mock.calls[0]?.[0]).toMatchObject({ audience: 'TIERS', tierIds: ['t-gold'] });
});

it('targets chosen customers found by code, email or name, several at once', async () => {
  const dialog = await openForm();
  await userEvent.click(within(dialog).getByLabelText('Khách hàng cụ thể'));
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  expect((await within(dialog).findByRole('alert')).textContent).toContain('Thêm ít nhất một khách hàng');
  await userEvent.type(within(dialog).getByLabelText(/Tìm khách/), 'KAS-674');
  await userEvent.click(await within(dialog).findByRole('button', { name: /KAS-674E22A3E859/ }));
  expect(within(within(dialog).getByRole('list', { name: 'Khách đã chọn' })).getByText(/Đinh Thị Anh Thư/)).toBeTruthy();
  expect(calls.search).toHaveBeenCalledWith('KAS-674');
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
  expect(calls.create.mock.calls[0]?.[0]).toMatchObject({ audience: 'CUSTOMERS', customerIds: ['c1'] });
});

it('lists who a voucher is for and when it was created, in hotel time', async () => {
  calls.list.mockResolvedValue([{ ...CREATED, status: 'ACTIVE', audience: 'CUSTOMERS', createdAt: '2026-11-14T07:05:00Z',
    validFromAt: '2026-11-14T07:05:00Z', validToAt: '2026-11-30T11:00:00Z',
    customers: [{ id: 'c1', customerCode: 'KAS-674E22A3E859', fullName: 'Đinh Thị Anh Thư' }] }]);
  render(<VoucherManager />);
  expect(await screen.findByText('1 khách: KAS-674E22A3E859')).toBeTruthy();
  expect(screen.getByText('14:05 14/11/2026 → 18:00 30/11/2026')).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Tạo lúc' })).toBeTruthy();
  expect(formatHotelTime('2026-11-14T07:05:00Z')).toBe('14:05 14/11/2026');
});
