// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CancellationFeeRule } from '@/lib/domain/cancellationFee';

const calls = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/api/endpoints/cancellationFees', () => ({ cancellationFeesApi: calls }));

import { CancellationFeeManager, feeValueError, policyName } from './CancellationFeeManager';

const HOTELS = [{ id: 'h1', label: 'KAS Ancient' }, { id: 'h2', label: 'KAS Elegance' }];
const rule = (over: Partial<CancellationFeeRule>): CancellationFeeRule => ({
  id: 'r1', propertyId: null, propertySlug: null, propertyName: null, feeType: 'PERCENT_OF_TOTAL', amountMinor: null,
  percent: 10, currency: 'VND', note: null, status: 'ACTIVE', version: 3, updatedAt: '2026-11-12T03:00:00Z', ...over,
});

beforeEach(() => {
  calls.list.mockResolvedValue([
    rule({}),
    rule({ id: 'r2', propertyId: 'h1', propertyName: 'KAS Ancient', feeType: 'FIXED_AMOUNT', amountMinor: 300000, percent: null, status: 'INACTIVE', note: 'Mùa cao điểm' }),
  ]);
  calls.create.mockResolvedValue(rule({ id: 'new' }));
  calls.update.mockResolvedValue(rule({}));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('validates fee values: no negatives, percent at most 100, whole VND', () => {
  expect(feeValueError('PERCENT_OF_TOTAL', '')).toMatch(/Nhập/);
  expect(feeValueError('PERCENT_OF_TOTAL', '-5')).toMatch(/âm/);
  expect(feeValueError('PERCENT_OF_TOTAL', '101')).toMatch(/100%/);
  expect(feeValueError('PERCENT_OF_TOTAL', '10.555')).toMatch(/2 chữ số/);
  expect(feeValueError('PERCENT_OF_TOTAL', '10')).toBeNull();
  expect(feeValueError('FIXED_AMOUNT', '1000.5')).toMatch(/nguyên/);
  expect(feeValueError('FIXED_AMOUNT', '300000')).toBeNull();
  expect(policyName({ propertyId: null, propertyName: null, propertySlug: null })).toMatch(/tất cả khách sạn/);
});

it('shows real overview figures and a table with scope, method, value and status', async () => {
  render(<CancellationFeeManager hotels={HOTELS} />);
  const overview = await screen.findByLabelText('Tổng quan');
  await waitFor(() => expect(within(overview).getByText('Tổng số chính sách').nextSibling?.textContent).toBe('2'));
  expect(within(overview).getByText('Đang hoạt động').nextSibling?.textContent).toBe('1');
  expect(within(overview).getByText('Đang tắt').nextSibling?.textContent).toBe('1');
  expect(within(overview).getByText('Khách sạn đang áp dụng').nextSibling?.textContent).toBe('Tất cả (2)');
  expect(screen.getByText('Chính sách riêng — KAS Ancient')).toBeTruthy();
  expect(screen.getByText('Số tiền cố định')).toBeTruthy();
  expect(screen.getByText('Tạm tắt', { selector: 'span' })).toBeTruthy();
});

it('filters the list by search text and status', async () => {
  render(<CancellationFeeManager hotels={HOTELS} />);
  await screen.findByText('Chính sách riêng — KAS Ancient');
  await userEvent.type(screen.getByLabelText('Tìm chính sách'), 'cao điểm');
  expect(screen.queryByText('Chính sách chung — tất cả khách sạn', { selector: 'span' })).toBeNull();
  await userEvent.clear(screen.getByLabelText('Tìm chính sách'));
  await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), 'ACTIVE');
  expect(screen.queryByText('Chính sách riêng — KAS Ancient')).toBeNull();
});

it('creates a policy from the grouped form, refusing an invalid value and previewing the fee', async () => {
  render(<CancellationFeeManager hotels={HOTELS} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Thêm chính sách' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Mức phí (%)'), '150');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm chính sách' }));
  expect((await within(dialog).findAllByRole('alert')).at(0)?.textContent).toMatch(/100%/);
  expect(calls.create).not.toHaveBeenCalled();
  await userEvent.clear(within(dialog).getByLabelText('Mức phí (%)'));
  await userEvent.type(within(dialog).getByLabelText('Mức phí (%)'), '10');
  expect(within(dialog).getByText('496.800 ₫')).toBeTruthy();
  await userEvent.selectOptions(within(dialog).getByLabelText('Áp dụng cho'), 'h2');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm chính sách' }));
  await waitFor(() => expect(calls.create).toHaveBeenCalledWith({ propertyId: 'h2', feeType: 'PERCENT_OF_TOTAL', amountMinor: null, percent: 10, note: null, status: 'ACTIVE' }));
});

it('asks before switching a policy off and sends the current version', async () => {
  render(<CancellationFeeManager hotels={HOTELS} />);
  await screen.findByText('Chính sách riêng — KAS Ancient');
  await userEvent.click(screen.getByRole('button', { name: 'Tắt' }));
  expect(calls.update).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Tạm ngưng' }));
  await waitFor(() => expect(calls.update).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'INACTIVE', version: 3 })));
});
