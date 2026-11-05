'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ratesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { formatMoney, type RateCell, type RateGridView } from '@/lib/domain/rate';
import { roomTypeName, type RoomTypeView } from '@/lib/domain/roomType';
import { Button, EmptyState } from '@/ui/primitives';
import { revalidateRates } from './actions';

/** Price editing only; room availability is checked manually outside KAS. */
export function RateCalendar({ propertyId, rooms, grid }: {
  readonly propertyId: string;
  readonly rooms: readonly RoomTypeView[];
  readonly grid: RateGridView;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RateCell | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  async function save(clear: boolean) {
    if (!editing || busy) return;
    const value = Number(amount);
    if (!clear && (amount.trim() === '' || !Number.isSafeInteger(value) || value < 0)) {
      setError('Nhập số tiền nguyên không âm.'); return;
    }
    setBusy(true); setError(null); setSuccess(false);
    try {
      if (clear) await ratesApi.clearDayPrice(editing.roomTypeId, editing.date);
      else await ratesApi.setDayPrice(editing.roomTypeId, editing.date, value);
      await revalidateRates(propertyId);
      setEditing(null); setSuccess(true); router.refresh();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 403
        ? 'Bạn không có quyền chỉnh giá.' : 'Không lưu được giá. Vui lòng thử lại.');
    } finally { setBusy(false); }
  }
  if (rooms.length === 0) return <EmptyState title="Chưa có loại phòng">Tạo loại phòng trước khi đặt giá.</EmptyState>;
  const dates = grid.rows[0]?.cells.map((cell) => cell.date) ?? [];
  return <section aria-label="Lịch giá phòng">
    {error ? <p role="alert">{error}</p> : null}
    {success ? <p role="status">Đã cập nhật giá.</p> : null}
    <div style={{ overflowX: 'auto' }}><table>
      <thead><tr><th scope="col">Loại phòng</th>{dates.map((date) => <th scope="col" key={date}>{date}</th>)}</tr></thead>
      <tbody>{rooms.map((room) => <tr key={room.id}>
        <th scope="row">{roomTypeName(room.translations)}</th>
        {(grid.rows.find((row) => row.roomTypeId === room.id)?.cells ?? []).map((cell) => <td key={cell.date}>
          <button type="button" disabled={busy} aria-label={`Giá ${roomTypeName(room.translations)} ${cell.date}`}
            onClick={() => { setEditing(cell); setAmount((cell.amountMinor === null || cell.amountMinor === undefined) ? '' : String(cell.amountMinor)); setError(null); setSuccess(false); }}>
            {(cell.amountMinor === null || cell.amountMinor === undefined) || !cell.currency ? 'Chưa có giá' : formatMoney(cell.amountMinor, cell.currency)}
          </button>
        </td>)}
      </tr>)}</tbody>
    </table></div>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
      <h2>Giá ngày {editing.date}</h2>
      <p>Đơn vị: {editing.currency ?? 'theo cấu hình giá của phòng'}. VND nhập theo đồng.</p>
      <label>Số tiền <input type="number" min="0" step="1" value={amount} disabled={busy}
        onChange={(event) => setAmount(event.target.value)} /></label>{' '}
      <Button type="submit" disabled={busy}>Lưu giá</Button>{' '}
      <Button type="button" disabled={busy} onClick={() => void save(true)}>Dùng lại giá cơ bản hoặc quy tắc</Button>{' '}
      <Button type="button" disabled={busy} onClick={() => setEditing(null)}>Đóng</Button>
    </form> : null}
  </section>;
}
