'use client';

import { salesRequestsApi } from '@/lib/api/endpoints';
import { TerminalRequestPanel, type TerminalCopy } from './TerminalRequestPanel';

/**
 * S11 — decline a direct request. Doc 54 §4 S11, doc 58 §5.
 *
 * <h2>KAS refuses; the guest did not cancel</h2>
 *
 * That distinction is the whole reason S11 and S12 are separate transitions
 * despite sharing a contract row. A decline is the hotel saying no, so its
 * reason is recorded on the transition and <strong>not</strong> on
 * {@code reservation.cancellation_reason} — that column and {@code cancelled_at}
 * are named for a cancellation, and the backend leaves both null here.
 *
 * <h2>The guest is emailed the reason</h2>
 *
 * After the transition the backend emails the guest (Brevo template
 * BOOKING_REQUEST_REJECTED) with the reason typed here, so the panel says the
 * reason is guest-facing before the agent commits.
 *
 * <p>The interaction lives in {@link TerminalRequestPanel}, which S12 shares.
 */
export function DeclineRequestPanel({
  reference,
  copy,
}: {
  readonly reference: string;
  readonly copy: DeclineCopy;
}) {
  return (
    <TerminalRequestPanel
      reference={reference}
      copy={copy}
      submit={salesRequestsApi.decline}
    />
  );
}

export type DeclineCopy = TerminalCopy;

/**
 * Vietnamese only — doc 69 §325, <em>"One console language in V1 (config A12)."</em>
 * The guest surface is bilingual; the console is not, and this is the console.
 *
 * <p>No {@code success} message: on success the request becomes terminal, the
 * panel disappears with the re-read, and the status badge is the report.
 */
export const DECLINE_COPY: DeclineCopy = {
  fieldId: 'decline-reason',
  title: 'Từ chối yêu cầu',
  intro:
    'Từ chối sẽ chuyển yêu cầu sang trạng thái cuối và trả lại toàn bộ phòng đang giữ. Không thể hoàn tác.',
  reasonLabel: 'Lý do từ chối',
  reasonHint: 'Bắt buộc. Lý do này được lưu vào lịch sử và xuất hiện trong email từ chối khách nhận được, nên hãy viết lịch sự, rõ ràng.',
  action: 'Từ chối yêu cầu',
  confirm: 'Xác nhận từ chối',
  confirmHint: 'Bấm “Xác nhận từ chối” để thực hiện, hoặc “Huỷ” để quay lại.',
  cancel: 'Huỷ',
  submitting: 'Đang xử lý…',
  noNotification:
    'Sau khi xác nhận, khách sẽ nhận email báo yêu cầu bị từ chối kèm lý do ở trên và đường dẫn xem khách sạn khác.',
  errorAlreadyMoved:
    'Yêu cầu này đã được xử lý bởi người khác. Vui lòng tải lại để xem trạng thái mới nhất.',
  errorNotFound: 'Không tìm thấy yêu cầu này.',
  errorNetwork: 'Không kết nối được tới hệ thống. Vui lòng thử lại.',
  errorServer: 'Đã có lỗi từ phía hệ thống. Vui lòng thử lại sau ít phút.',
};
