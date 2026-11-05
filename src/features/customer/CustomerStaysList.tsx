'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Locale } from '@/config/env';
import { customerStaysApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { CancellationResult, CustomerStay } from '@/lib/domain/customerStay';
import { formatMoney } from '@/lib/domain/rate';
import { Button, ConfirmDialog } from '@/ui/primitives';
import styles from './CustomerStaysList.module.css';

type Action = { readonly reference: string; readonly kind: 'cancel' | 'accept' | 'decline' };

const COPY = {
  vi: {
    cancelTitle: 'Gửi yêu cầu huỷ phòng?',
    cancelBody: 'Hệ thống kiểm tra thời hạn miễn phí. Nếu đã quá hạn, khách sạn sẽ báo phí và phòng chỉ được huỷ sau khi bạn đồng ý.',
    acceptTitle: 'Đồng ý phí huỷ?',
    acceptBody: 'Khi xác nhận, phòng sẽ được huỷ và bạn chấp nhận mức phí khách sạn đã báo.',
    declineTitle: 'Từ chối phí huỷ?',
    declineBody: 'Phòng sẽ vẫn được giữ và yêu cầu báo phí này sẽ đóng lại.',
    confirm: 'Xác nhận',
    cancel: 'Để sau',
    request: 'Yêu cầu huỷ',
    accept: 'Đồng ý và huỷ phòng',
    decline: 'Từ chối phí',
    pending: 'Đã gửi yêu cầu huỷ. Khách sạn sẽ báo phí nếu áp dụng; phòng vẫn được giữ trong lúc chờ.',
    quoted: 'Khách sạn đã báo phí huỷ',
    pendingStatus: 'Chờ khách sạn báo phí',
    quotedStatus: 'Chờ bạn xác nhận phí',
    expiredStatus: 'Yêu cầu huỷ đã hết hạn',
    expired: 'Yêu cầu huỷ và báo phí đã hết hạn lúc 12:00 ngày nhận phòng. Đặt phòng vẫn còn hiệu lực; vui lòng liên hệ khách sạn để được hỗ trợ.',
    requestedSuccess: 'Yêu cầu huỷ đã được ghi nhận.',
    cancelledSuccess: 'Đặt phòng đã được huỷ.',
    declined: 'Bạn đã từ chối mức phí. Đặt phòng vẫn còn hiệu lực.',
    cancelled: 'Đã huỷ',
    stay: 'Lưu trú',
    reference: 'Mã đặt phòng',
    total: 'Tổng tiền',
    hotel: 'Khách sạn',
    active: 'Đang hoạt động',
    noStays: 'Chưa có đặt phòng gắn với tài khoản này.',
    browse: 'Khám phá khách sạn',
    busy: 'Đang cập nhật…',
    error: 'Không thể cập nhật yêu cầu. Vui lòng tải lại và thử lại.',
    unavailable: 'Không thể tải lại danh sách ngay lúc này. Hãy tải lại trang để xem trạng thái mới nhất.',
    feeNote: 'Ghi chú từ khách sạn',
  },
  en: {
    cancelTitle: 'Request to cancel this stay?',
    cancelBody: 'The system checks the free-cancellation deadline. If it has passed, the hotel will quote a fee and the stay will only be cancelled after you accept.',
    acceptTitle: 'Accept the cancellation fee?',
    acceptBody: 'Confirming will cancel the stay and accept the fee quoted by the hotel.',
    declineTitle: 'Decline the cancellation fee?',
    declineBody: 'The stay will remain active and this fee request will close.',
    confirm: 'Confirm',
    cancel: 'Go back',
    request: 'Request cancellation',
    accept: 'Accept fee and cancel',
    decline: 'Decline fee',
    pending: 'Cancellation requested. The hotel will quote a fee if applicable; your stay remains active while you wait.',
    quoted: 'The hotel quoted a cancellation fee',
    pendingStatus: 'Waiting for hotel quote',
    quotedStatus: 'Fee decision needed',
    expiredStatus: 'Cancellation request expired',
    expired: 'The cancellation request and fee quote expired at noon on check-in day. Your booking remains active; contact the hotel for help.',
    requestedSuccess: 'Your cancellation request has been recorded.',
    cancelledSuccess: 'Your booking has been cancelled.',
    declined: 'You declined the fee. Your booking remains active.',
    cancelled: 'Cancelled',
    stay: 'Stay',
    reference: 'Booking reference',
    total: 'Total',
    hotel: 'Hotel',
    active: 'Active',
    noStays: 'There are no bookings linked to this account yet.',
    browse: 'Explore hotels',
    busy: 'Updating…',
    error: 'Could not update the request. Reload and try again.',
    unavailable: 'The list could not refresh just now. Reload the page to see the latest status.',
    feeNote: 'Note from the hotel',
  },
} as const;

export function CustomerStaysList({
  initialStays,
  locale,
}: {
  readonly initialStays: readonly CustomerStay[];
  readonly locale: Locale;
}) {
  const copy = COPY[locale];
  const [stays, setStays] = useState([...initialStays]);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeStay = action ? stays.find((stay) => stay.reference === action.reference) : undefined;

  async function submitAction() {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      let result: CancellationResult;
      if (action.kind === 'cancel') {
        result = await customerStaysApi.cancel(action.reference);
      } else {
        result = await customerStaysApi.decide(action.reference, action.kind === 'accept');
      }
      setSuccess(result.status === 'CANCELLED' ? copy.cancelledSuccess : result.status === 'DECLINED' ? copy.declined : copy.requestedSuccess);
      setAction(null);
      setStays(await customerStaysApi.list(locale));
    } catch (caught) {
      setError(caught instanceof ApiError ? messageFor(caught, locale) : copy.error);
    } finally {
      setBusy(false);
    }
  }

  if (stays.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{copy.noStays}</p>
        <Link href={`/${locale}/hotels`} className={styles.link}>{copy.browse}</Link>
      </div>
    );
  }

  return (
    <>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {success ? <p className={styles.success} role="status">{success}</p> : null}
      <div className={styles.list}>
        {stays.map((stay) => (
          <StayCard
            key={stay.reference}
            stay={stay}
            locale={locale}
            copy={copy}
            busy={busy && action?.reference === stay.reference}
            onAction={(kind) => setAction({ reference: stay.reference, kind })}
          />
        ))}
      </div>
      <ConfirmDialog
        open={action !== null}
        title={action ? dialogTitle(action.kind, copy) : ''}
        confirmLabel={action ? dialogButton(action.kind, copy) : copy.confirm}
        cancelLabel={copy.cancel}
        destructive={action?.kind !== 'decline'}
        busy={busy}
        onConfirm={submitAction}
        onCancel={() => setAction(null)}
      >
        {action ? dialogBody(action.kind, activeStay, copy) : null}
      </ConfirmDialog>
    </>
  );
}

function StayCard({
  stay,
  locale,
  copy,
  busy,
  onAction,
}: {
  readonly stay: CustomerStay;
  readonly locale: Locale;
  readonly copy: (typeof COPY)[Locale];
  readonly busy: boolean;
  readonly onAction: (kind: Action['kind']) => void;
}) {
  const requestStatus = stay.cancellationRequestStatus;
  const currentStatus = stay.stayStatus ?? stay.salesStatus;
  const cancelled = currentStatus === 'CANCELLED';
  const pending = requestStatus === 'PENDING_HOTEL_FEE';
  const quoted = requestStatus === 'QUOTED';
  const expired = requestStatus === 'EXPIRED';
  const canRequest = !cancelled && !pending && !quoted && !expired && isCancelable(stay);
  const dateLocale = locale === 'vi' ? 'vi-VN' : 'en-US';

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{copy.hotel}</p>
          <h2 className={styles.hotel}>{stay.propertyName ?? stay.propertySlug}</h2>
        </div>
        <span className={`${styles.status} ${cancelled ? styles.statusCancelled : ''}`}>
          {cancelled ? copy.cancelled : pending ? copy.pendingStatus : quoted ? copy.quotedStatus : expired ? copy.expiredStatus : statusLabel(currentStatus, locale)}
        </span>
      </div>

      <dl className={styles.details}>
        <div><dt>{copy.reference}</dt><dd>{stay.reference}</dd></div>
        <div><dt>{copy.stay}</dt><dd>{formatDate(stay.checkIn, dateLocale)} – {formatDate(stay.checkOut, dateLocale)}</dd></div>
        {stay.totalMinor === null ? null : <div><dt>{copy.total}</dt><dd>{formatMoney(stay.totalMinor, stay.currency)}</dd></div>}
      </dl>

      {pending ? <p className={styles.notice}>{copy.pending}</p> : null}
      {expired ? <p className={styles.notice}>{copy.expired}</p> : null}
      {quoted ? (
        <div className={styles.quote}>
          <p className={styles.notice}>{copy.quoted}: <strong>{stay.cancellationFeeMinor === null ? '—' : formatMoney(stay.cancellationFeeMinor, stay.cancellationFeeCurrency ?? stay.currency)}</strong></p>
          {stay.cancellationFeeNote ? <p className={styles.note}>{copy.feeNote}: {stay.cancellationFeeNote}</p> : null}
          <div className={styles.actions}>
            <Button type="button" variant="danger" disabled={busy} onClick={() => onAction('accept')}>{copy.accept}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onAction('decline')}>{copy.decline}</Button>
          </div>
        </div>
      ) : null}
      {canRequest ? (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" disabled={busy} loading={busy} onClick={() => onAction('cancel')}>
            {busy ? copy.busy : copy.request}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function isCancelable(stay: CustomerStay): boolean {
  if (stay.stayStatus === null) {
    return ['REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK', 'CUSTOMER_CONTACTED', 'ALTERNATIVE_OFFERED'].includes(stay.salesStatus ?? '');
  }
  return stay.salesStatus === 'WON' && ['CONFIRMED', 'CHECK_IN_READY'].includes(stay.stayStatus);
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function statusLabel(status: string | null, locale: Locale): string {
  const labels: Record<string, readonly [string, string]> = {
    REQUESTED: ['Đã nhận yêu cầu', 'Request received'], ASSIGNED: ['Đang xử lý', 'In progress'],
    AVAILABILITY_CHECK: ['Đang kiểm tra phòng', 'Checking availability'], CUSTOMER_CONTACTED: ['Đã liên hệ', 'Contacted'],
    ALTERNATIVE_OFFERED: ['Đã gửi phương án', 'Alternative offered'], WON: ['Đã xác nhận', 'Confirmed'],
    CONFIRMED: ['Đã xác nhận', 'Confirmed'], CHECK_IN_READY: ['Sẵn sàng nhận phòng', 'Ready for check-in'],
    CHECKED_IN: ['Đã nhận phòng', 'Checked in'], CHECKED_OUT: ['Đã trả phòng', 'Checked out'],
    COMPLETED: ['Đã hoàn tất', 'Completed'], DECLINED: ['Đã từ chối', 'Declined'],
    EXPIRED: ['Đã hết hạn', 'Expired'], NO_SHOW: ['Không đến nhận phòng', 'No-show'],
  };
  const found = status ? labels[status] : undefined;
  return found ? found[locale === 'vi' ? 0 : 1] : locale === 'vi' ? 'Đang hoạt động' : 'Active';
}

function dialogTitle(kind: Action['kind'], copy: (typeof COPY)[Locale]): string {
  return kind === 'cancel' ? copy.cancelTitle : kind === 'accept' ? copy.acceptTitle : copy.declineTitle;
}

function dialogButton(kind: Action['kind'], copy: (typeof COPY)[Locale]): string {
  return kind === 'cancel' ? copy.request : kind === 'accept' ? copy.accept : copy.decline;
}

function dialogBody(kind: Action['kind'], stay: CustomerStay | undefined, copy: (typeof COPY)[Locale]) {
  if (kind === 'cancel') return copy.cancelBody;
  if (kind === 'decline') return copy.declineBody;
  const fee = stay?.cancellationFeeMinor;
  const currency = stay?.cancellationFeeCurrency ?? stay?.currency;
  return fee !== null && fee !== undefined && currency
    ? `${copy.acceptBody} ${formatMoney(fee, currency)}`
    : copy.acceptBody;
}

function messageFor(error: ApiError, locale: Locale): string {
  if (error.isForbidden) return locale === 'vi' ? 'Tài khoản này không có quyền xem lưu trú khách hàng.' : 'This account cannot access customer stays.';
  if (error.isNotFound) return locale === 'vi' ? 'Không tìm thấy đặt phòng này.' : 'This booking could not be found.';
  if (error.isConflict || error.isUnprocessable) return locale === 'vi' ? 'Không thể huỷ ở trạng thái hiện tại. Hãy tải lại để xem cập nhật mới nhất.' : 'This booking cannot be cancelled in its current state. Reload to see the latest status.';
  return locale === 'vi' ? 'Không thể kết nối tới hệ thống. Vui lòng thử lại.' : 'Could not connect to KAS. Please try again.';
}
