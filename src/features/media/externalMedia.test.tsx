// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn(), property: vi.fn(), room: vi.fn() }));
vi.mock('@/lib/api/endpoints/media', () => ({ mediaApi: { external: calls.add } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock('./actions', () => ({ revalidateGallery: calls.property, revalidateRoomGallery: calls.room }));
import { ExternalMediaForm } from './ExternalMediaForm';
beforeEach(() => { vi.clearAllMocks(); calls.add.mockResolvedValue({ id: 'image' }); });
afterEach(cleanup);

async function fill(url = 'https://cdn.example.invalid/hotel.jpg') {
  await userEvent.type(screen.getByLabelText('URL ảnh'), url);
  await userEvent.type(screen.getByLabelText('Mô tả ảnh tiếng Việt'), 'Khách sạn');
  await userEvent.type(screen.getByLabelText('Mô tả ảnh tiếng Anh'), 'Hotel');
}
it('adds an HTTPS image to the correct owner and refreshes the hotel gallery', async () => {
  render(<ExternalMediaForm propertyId="hotel" ownerId="hotel" ownerType="PROPERTY" displayOrder={3} />);
  await fill(); await userEvent.click(screen.getByRole('button', { name: 'Thêm và xuất bản ảnh URL' }));
  await waitFor(() => expect(calls.add).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://cdn.example.invalid/hotel.jpg', ownerType: 'PROPERTY', ownerId: 'hotel', displayOrder: 3, altTextVi: 'Khách sạn', altTextEn: 'Hotel' })));
  expect(calls.property).toHaveBeenCalledWith('hotel'); expect(calls.refresh).toHaveBeenCalled();
});
it('refuses HTTP references before making an API request', async () => {
  render(<ExternalMediaForm propertyId="hotel" ownerId="room" ownerType="ROOM_TYPE" displayOrder={0} />);
  await fill('http://cdn.example.invalid/hotel.jpg'); await userEvent.click(screen.getByRole('button', { name: 'Thêm và xuất bản ảnh URL' }));
  expect(screen.getByRole('alert')).toBeTruthy(); expect(calls.add).not.toHaveBeenCalled();
});
it('preserves the URL after a failure so it can be retried', async () => {
  calls.add.mockRejectedValue(new Error('offline'));
  render(<ExternalMediaForm propertyId="hotel" ownerId="room" ownerType="ROOM_TYPE" displayOrder={0} />);
  await fill(); await userEvent.click(screen.getByRole('button', { name: 'Thêm và xuất bản ảnh URL' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByLabelText<HTMLInputElement>('URL ảnh').value).toBe('https://cdn.example.invalid/hotel.jpg');
  expect(calls.room).not.toHaveBeenCalled(); expect(calls.refresh).not.toHaveBeenCalled();
});
