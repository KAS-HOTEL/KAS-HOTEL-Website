// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ reviews: vi.fn(), moderate: vi.fn(), customers: vi.fn(), vouchers: vi.fn(), createVoucher: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: calls.push, refresh: vi.fn() }) }));
vi.mock('@/lib/api/endpoints/adminTools', () => ({
  ADMIN_LIST_PAGE_SIZE: 50,
  reviewsApi: { list: calls.reviews, moderate: calls.moderate },
  customersApi: { list: calls.customers, update: vi.fn() },
  vouchersApi: { list: calls.vouchers, create: calls.createVoucher, setStatus: vi.fn() },
}));
import { ReviewManager } from './ReviewManager';
import { CustomerManager } from './CustomerManager';
import { VoucherManager } from './VoucherManager';

beforeEach(() => {
  vi.resetAllMocks();
  calls.reviews.mockResolvedValue([]);
  calls.customers.mockResolvedValue([]);
  calls.vouchers.mockResolvedValue([]);
  calls.moderate.mockResolvedValue({});
});
afterEach(cleanup);

it('shows an empty state without unusable pagination', async () => {
  render(<ReviewManager />);
  expect(await screen.findByText('Không có đánh giá phù hợp')).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Phân trang danh sách' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows a retry action and hides pagination after a failed read', async () => {
  calls.reviews.mockRejectedValueOnce(new Error('offline'));
  render(<ReviewManager />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('Chưa tải được đánh giá')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Trang sau' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Không có đánh giá phù hợp')).toBeTruthy();
  expect(calls.reviews).toHaveBeenCalledTimes(2);
});

it('applies hotel and visibility filters together after confirmation', async () => {
  render(<ReviewManager />);
  await screen.findByText('Không có đánh giá phù hợp');
  await userEvent.type(screen.getByLabelText('Mã khách sạn'), ' hotel-01 ');
  await userEvent.click(screen.getByLabelText('Bao gồm bài ẩn / đã xóa'));
  expect(calls.reviews).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
  await waitFor(() => expect(calls.reviews).toHaveBeenLastCalledWith('hotel-01', true, 0));
});

it('keeps the previous-page action when the next page is empty', async () => {
  calls.reviews.mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => ({
    id: `review-${index}`, hotelKey: 'hotel-01', rating: 4,
    body: 'Review fixture', language: 'vi', status: 'APPROVED',
  })));
  render(<ReviewManager />);
  await screen.findByText('50 bài trên trang này');
  await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await screen.findByText('Không có đánh giá phù hợp');
  expect(screen.getByText('Trang 2')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
  await waitFor(() => expect(calls.reviews).toHaveBeenLastCalledWith('', false, 0));
});

it('requires a reason before sending a moderation decision', async () => {
  calls.reviews.mockResolvedValue([{ id: 'review-1', hotelKey: 'hotel-01', rating: 5,
    body: 'Guest-authored text', language: 'vi', status: 'PENDING' }]);
  render(<ReviewManager />);
  await userEvent.click(await screen.findByRole('button', { name: /^Duyệt$/ }));
  const save = screen.getByRole('button', { name: 'Lưu quyết định' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await userEvent.type(screen.getByLabelText('Lý do'), 'Đã đối chiếu kỳ lưu trú');
  await userEvent.click(save);
  await waitFor(() => expect(calls.moderate).toHaveBeenCalledWith('review-1', 'APPROVE', 'Đã đối chiếu kỳ lưu trú'));
  expect(calls.reviews).toHaveBeenCalledTimes(2);
});

it('does not display customer pagination after a connection error', async () => {
  calls.customers.mockRejectedValue(new Error('offline'));
  render(<CustomerManager />);
  expect(await screen.findByText('Chưa tải được khách hàng')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Trang sau' })).toBeNull();
});

it('keeps voucher creation accessible even when the list is empty', async () => {
  render(<VoucherManager />);
  await screen.findByText('Không có voucher phù hợp');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
  expect(screen.getByRole('dialog', { name: 'Tạo voucher' })).toBeTruthy();
});

it('creates a voucher without asking for a code, and shows the code the server generated', async () => {
  calls.createVoucher.mockResolvedValue({ id: 'v1', code: 'KAS-ABCD2345', name: 'Mùa thu', type: 'PERCENTAGE', valuePercent: 10, currency: 'VND', usedCount: 0, stackable: false, status: 'DRAFT' });
  render(<VoucherManager />);
  await screen.findByText('Không có voucher phù hợp');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
  const dialog = screen.getByRole('dialog', { name: 'Tạo voucher' });
  expect(dialog.querySelector('input[name="code"]')).toBeNull();
  expect(screen.queryByText('Quyền lợi thêm')).toBeNull();
  expect([...dialog.querySelectorAll('option')].map((option) => option.value)).not.toContain('VALUE_ADD');
  await userEvent.type(screen.getByLabelText('Tên voucher'), 'Mùa thu');
  await userEvent.type(screen.getByLabelText('Giá trị giảm (%)'), '10');
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  await waitFor(() => expect(calls.createVoucher).toHaveBeenCalledTimes(1));
  expect(calls.createVoucher.mock.calls[0]?.[0]).not.toHaveProperty('code');
  expect(calls.createVoucher.mock.calls[0]?.[0]).toMatchObject({ name: 'Mùa thu', type: 'PERCENTAGE', valuePercent: 10 });
  expect(await screen.findByText('KAS-ABCD2345')).toBeTruthy();
  expect(screen.getByText(/Đã tạo voucher/)).toBeTruthy();
});

it('lists customers with code, account status and registration date, and opens a row', async () => {
  calls.customers.mockResolvedValue([{ id: 'c1', fullName: 'Lan Anh', email: 'lan@example.invalid', phone: '0900', locale: 'vi', createdAt: '2026-10-01T03:00:00Z', points: 0, reservedPoints: 0, customerCode: 'KAS-123ABC', accountStatus: 'UNVERIFIED', avatarUrl: null }]);
  render(<CustomerManager />);
  expect(await screen.findByText('KAS-123ABC')).toBeTruthy();
  for (const header of ['Mã khách hàng', 'Họ tên', 'Email', 'Số điện thoại', 'Ngày đăng ký', 'Trạng thái tài khoản']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
  }
  expect(screen.getByText('Chưa xác thực email')).toBeTruthy();
  expect(screen.getByText('01/10/2026')).toBeTruthy();
  await userEvent.click(screen.getByText('lan@example.invalid'));
  expect(calls.push).toHaveBeenCalledWith('/admin/customers/c1');
});

it('applies a voucher to chosen hotels, or to every hotel by default', async () => {
  calls.createVoucher.mockResolvedValue({ id: 'v2', code: 'KAS-HOTEL234', name: 'Riverside', type: 'PERCENTAGE', valuePercent: 5, currency: 'VND', usedCount: 0, stackable: false, status: 'DRAFT', properties: [{ slug: 'kas-riverside', name: 'KAS Riverside' }] });
  render(<VoucherManager hotels={[{ slug: 'kas-riverside', label: 'KAS Riverside' }, { slug: 'kas-milestone', label: 'KAS Milestone' }]} />);
  await screen.findByText('Không có voucher phù hợp');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
  expect(screen.getByLabelText('Tất cả khách sạn')).toHaveProperty('checked', true);
  expect(screen.queryByLabelText('KAS Riverside')).toBeNull();
  await userEvent.click(screen.getByLabelText('Chọn khách sạn'));
  await userEvent.type(screen.getByLabelText('Tên voucher'), 'Riverside');
  await userEvent.type(screen.getByLabelText('Giá trị giảm (%)'), '5');
  const dialog = screen.getByRole('dialog', { name: 'Tạo voucher' });
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  expect(await screen.findByText('Chọn ít nhất một khách sạn, hoặc áp dụng cho tất cả khách sạn.')).toBeTruthy();
  expect(calls.createVoucher).not.toHaveBeenCalled();
  await userEvent.click(screen.getByLabelText('KAS Riverside'));
  await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement);
  await waitFor(() => expect(calls.createVoucher).toHaveBeenCalledTimes(1));
  expect(calls.createVoucher.mock.calls[0]?.[0]).toMatchObject({ propertySlugs: ['kas-riverside'] });
});
