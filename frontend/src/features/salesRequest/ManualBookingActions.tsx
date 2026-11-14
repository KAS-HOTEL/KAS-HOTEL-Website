'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { salesRequestsApi } from '@/lib/api/endpoints/salesRequests';
import { publicHotelsApi } from '@/lib/api/endpoints/publicHotels';
import type { PublishedProperty, PublishedRoomType } from '@/lib/domain/availability';
import { ApiError } from '@/lib/api/errors';
import { messageFor } from '@/features/auth/messages';
import { MANUAL_REVIEW_STATUSES, type AlternativeOffer } from '@/lib/domain/manualBooking';
import type { SalesRequestPayment, SalesRequestSummary } from '@/lib/domain/salesRequest';
import { formatMoney } from '@/lib/domain/availability';
import { Button, Card, ConfirmDialog, useToast } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';

export function ManualBookingActions({ request, payment = null }: {
  readonly request: SalesRequestSummary;
  /** Payment options from the detail (2026-11-12); null from older servers = manual flow. */
  readonly payment?: SalesRequestPayment | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'approve' | 'paid' | 'offer' | null>(null);
  const inFlight = useRef(false);
  const [offering, setOffering] = useState(false);
  const [hotels, setHotels] = useState<PublishedProperty[]>([]);
  const [rooms, setRooms] = useState<PublishedRoomType[]>([]);
  const [offer, setOffer] = useState<AlternativeOffer>({ propertySlug: request.propertySlug,
    roomTypeSlug: '', checkIn: request.checkIn, checkOut: request.checkOut,
    quantity: request.rooms, totalMinor: 0, message: '' });
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      const offered = confirm === 'offer';
      await action(); setConfirm(null); setOffering(false); router.refresh();
      // The email is queued, not yet delivered: its real status shows under "Trạng thái email".
      toast.show('success', offered
        ? 'Đã ghi nhận đề xuất và kết thúc yêu cầu. Email đề xuất đã vào hàng đợi.'
        : 'Đã lưu quyết định của khách sạn.');
    } catch (caught) {
      setConfirm(null);
      setError(caught instanceof ApiError
        ? caught.code === 'CONFIG_MISSING'
          ? 'Chưa gửi được link thanh toán: cổng SePay chưa được bật trên hệ thống. Vui lòng báo quản trị kỹ thuật KAS kiểm tra cấu hình SePay rồi thử lại.'
          : messageFor(caught)
        : 'Không thể kết nối. Vui lòng thử lại.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function chooseHotel(slug: string, options = hotels) {
    setOffer((current) => ({ ...current, propertySlug: slug, roomTypeSlug: '' }));
    setRooms([]);
    if (!options.some((hotel) => hotel.slug === slug)) return;
    const result = await publicHotelsApi.roomTypes(slug, 'vi');
    setRooms(result);
    setOffer((current) => ({ ...current, roomTypeSlug: result[0]?.slug ?? '' }));
  }
  async function openOffer() {
    if (offering) { setOffering(false); return; }
    setOffering(true); setBusy(true); setError('');
    try {
      const options = await publicHotelsApi.properties('vi');
      setHotels(options);
      await chooseHotel(options.find((hotel) => hotel.slug === request.propertySlug)?.slug ?? options[0]?.slug ?? '', options);
    } catch (caught) { setError(caught instanceof ApiError ? messageFor(caught) : 'Không tải được danh sách phòng thay thế.'); }
    finally { setBusy(false); }
  }
  const reviewable = MANUAL_REVIEW_STATUSES.has(request.salesStatus);
  if (!reviewable && request.salesStatus !== 'PAYMENT_PENDING') return null;
  // SePay on: a paid order confirms the booking by itself (IPN); staff confirm by hand only a
  // manual transfer, so that button becomes secondary (owner 2026-11-12).
  const online = payment?.onlineGateway === true;
  const pending = request.salesStatus === 'PAYMENT_PENDING';
  return <Card title="Trả lời yêu cầu đặt phòng">
    {pending && online
      ? <p>Khách thanh toán qua cổng SePay. Đặt phòng <strong>tự động xác nhận</strong> ngay khi SePay báo đã nhận tiền — không cần thao tác.
        {' Chỉ bấm "Xác nhận thủ công" khi '}{payment?.manualTransfer ? 'khách chuyển khoản tay, hoặc ' : ''}{'SePay không tự xác nhận dù tiền đã vào tài khoản.'}</p>
      : reviewable && online
        ? <p>Kiểm tra phòng thực tế rồi xác nhận: khách nhận email có link thanh toán SePay, đặt phòng tự xác nhận khi tiền về.</p>
        : <p>Khách sạn tự kiểm tra phòng và đối chiếu tiền trong tài khoản ngân hàng trước khi xác nhận.</p>}
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}>
      {reviewable && <>
        <Button disabled={busy} onClick={() => setConfirm('approve')}>Còn phòng — xác nhận và gửi link thanh toán</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void openOffer()}>Hết phòng — đề xuất phòng khác</Button>
      </>}
      {pending && <Button variant={online ? 'secondary' : 'primary'} disabled={busy} onClick={() => setConfirm('paid')}>{online ? 'Xác nhận thủ công' : 'Xác nhận đã nhận tiền'}</Button>}
    </div>
    {offering && <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (busy || !offer.roomTypeSlug) return;
      if (offer.checkOut <= offer.checkIn) { setError('Ngày trả phòng phải sau ngày nhận phòng.'); return; }
      if (!Number.isSafeInteger(offer.quantity) || offer.quantity < 1 || !Number.isSafeInteger(offer.totalMinor) || offer.totalMinor < 1) { setError('Số phòng và tổng giá phải là số nguyên dương hợp lệ.'); return; }
      setError(''); setConfirm('offer');
    }}>
      <label>Khách sạn<select required disabled={busy} value={offer.propertySlug} onChange={(event) => {
        setBusy(true); setError('');
        void chooseHotel(event.target.value).catch((caught: unknown) => setError(caught instanceof ApiError ? messageFor(caught) : 'Không tải được hạng phòng.')).finally(() => setBusy(false));
      }}><option value="">Chọn khách sạn</option>{hotels.map((hotel) => <option key={hotel.slug} value={hotel.slug}>{hotel.name ?? hotel.slug}</option>)}</select></label>
      <label>Hạng phòng<select required disabled={busy} value={offer.roomTypeSlug} onChange={(event) => setOffer({ ...offer, roomTypeSlug: event.target.value })}><option value="">Chọn hạng phòng</option>{rooms.map((room) => <option key={room.slug} value={room.slug}>{room.name}</option>)}</select></label>
      <label>Nhận phòng<input required disabled={busy} type="date" value={offer.checkIn} onChange={(event) => setOffer({ ...offer, checkIn: event.target.value })} /></label>
      <label>Trả phòng<input required disabled={busy} type="date" min={offer.checkIn} value={offer.checkOut} onChange={(event) => setOffer({ ...offer, checkOut: event.target.value })} /></label>
      <label>Số phòng<input required disabled={busy} type="number" min={1} step={1} value={offer.quantity} onChange={(event) => setOffer({ ...offer, quantity: Number(event.target.value) })} /></label>
      <label>Tổng giá ({request.total?.currency ?? 'VND'}, đơn vị nhỏ nhất)<input required disabled={busy} type="number" min={1} step={1} value={offer.totalMinor || ''} onChange={(event) => setOffer({ ...offer, totalMinor: Number(event.target.value) })} /></label>
      <label>Lời nhắn<textarea disabled={busy} maxLength={2000} value={offer.message} onChange={(event) => setOffer({ ...offer, message: event.target.value })} /></label>
      <Button type="submit" loading={busy} disabled={busy || !offer.roomTypeSlug}>Xem lại đề xuất</Button>
    </form>}
    <ConfirmDialog open={confirm !== null} title={confirm === 'paid' ? 'Xác nhận tiền đã vào tài khoản?' : confirm === 'offer' ? 'Gửi đề xuất phòng khác?' : 'Xác nhận còn phòng và gửi link thanh toán?'}
      onCancel={() => { if (!busy) setConfirm(null); }}
      onConfirm={() => { if (confirm) void run(() => confirm === 'paid' ? salesRequestsApi.confirmPayment(request.reference) : confirm === 'offer' ? salesRequestsApi.proposeAlternative(request.reference, offer) : salesRequestsApi.approvePayment(request.reference)); }}
      confirmLabel={confirm === 'offer' ? 'Gửi đề xuất và kết thúc yêu cầu' : 'Xác nhận'} busy={busy}>
      {confirm === 'offer' ? <>
        <p>{hotels.find((hotel) => hotel.slug === offer.propertySlug)?.name ?? offer.propertySlug} · {rooms.find((room) => room.slug === offer.roomTypeSlug)?.name ?? offer.roomTypeSlug}</p>
        <p>{offer.checkIn} → {offer.checkOut} · {offer.quantity} phòng</p>
        <p>Tổng giá: {formatMoney({ amountMinor: offer.totalMinor, currency: request.total?.currency ?? 'VND', exponent: request.total?.exponent ?? 0 })}</p>
        {offer.message && <p>{offer.message}</p>}
        <p>Yêu cầu này sẽ kết thúc ngay khi gửi đề xuất. Không giữ phòng và không tạo yêu cầu mới; nếu khách muốn lưu trú theo phương án này, khách tạo yêu cầu mới trên website.</p>
      </> : confirm === 'paid' ? 'Chỉ xác nhận sau khi đã đối chiếu giao dịch ngân hàng. Đặt phòng sẽ được xác nhận cho khách.' : 'Bạn đã kiểm tra và xác nhận còn phòng thủ công. Hệ thống chuyển yêu cầu sang chờ thanh toán và gửi email có link thanh toán (SePay) cùng hạn thanh toán cho khách. Chưa xác nhận đã nhận tiền.'}
    </ConfirmDialog>
  </Card>;
}
