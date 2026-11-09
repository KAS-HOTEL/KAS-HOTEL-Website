'use client';

import { salesRequestsApi } from '@/lib/api/endpoints';
import { TerminalRequestPanel, type TerminalCopy } from './TerminalRequestPanel';

/**
 * S12 — cancel a direct request. Doc 54 §4 S12, doc 58 §5.
 *
 * <h2>The guest cancelled; KAS did not refuse</h2>
 *
 * S11 and S12 share a contract row, a permission, a guard and the same hold
 * behaviour, so they share {@link TerminalRequestPanel}. What separates them is
 * meaning, and the record follows it: a cancel reaches {@code CANCELLED}, audits
 * {@code reservation.cancelled}, and writes {@code cancelled_at} and
 * {@code cancellation_reason} — the columns a decline correctly leaves null.
 *
 * <h2>This is the sales half of S12</h2>
 *
 * Doc 54 gives S12 the actors <strong>C / S</strong>. A guest cancelling their
 * own stay is the separate frozen route {@code POST /me/stays/{reference}/cancel},
 * which is not implemented — so an agent using this panel is recording a
 * cancellation, not performing the guest's.
 *
 * <h2>Nothing is sent to the guest</h2>
 *
 * Doc 54 S12 lists "guest email + in-app"; doc 117 §8.1 freezes that a transition
 * owes the business effect and the record, not delivery. OQ-162 is open and no
 * mail sender exists, and the panel says so before the agent commits.
 */
export function CancelRequestPanel({
  reference,
  copy,
}: {
  readonly reference: string;
  readonly copy: CancelCopy;
}) {
  return (
    <TerminalRequestPanel
      reference={reference}
      copy={copy}
      submit={salesRequestsApi.cancel}
      cancelOptions
    />
  );
}

export type CancelCopy = TerminalCopy;

/**
 * Vietnamese only — doc 69 §325, <em>"One console language in V1 (config A12)."</em>
 *
 * <p>Unlike the decline, this one carries a {@code success} message. A decline is
 * something KAS decided and the changed badge says enough; a cancellation is
 * something an agent records on a guest's behalf, and confirming that it was
 * written is worth a line.
 */
export const CANCEL_COPY: CancelCopy = {
  fieldId: 'cancel-reason',
  title: 'Huỷ yêu cầu',
  intro:
    'Ghi nhận việc khách huỷ yêu cầu này. Yêu cầu sẽ chuyển sang trạng thái cuối và trả lại toàn bộ phòng đang giữ. Không thể hoàn tác.',
  reasonLabel: 'Lý do huỷ',
  reasonHint: 'Được lưu vào hồ sơ yêu cầu và lịch sử trạng thái. Bắt buộc.',
  action: 'Huỷ yêu cầu',
  confirm: 'Xác nhận huỷ',
  confirmHint: 'Bấm “Xác nhận huỷ” để thực hiện, hoặc “Quay lại” để giữ nguyên.',
  // Deliberately not "Huỷ": next to "Huỷ yêu cầu" it would be ambiguous which
  // one abandons the form and which one cancels the guest's request.
  cancel: 'Quay lại',
  submitting: 'Đang xử lý…',
  success: 'Đã ghi nhận việc huỷ yêu cầu. Toàn bộ phòng đang giữ đã được trả lại.',
  noNotification:
    'Sau khi xác nhận, hệ thống đưa email báo huỷ vào hàng đợi; trạng thái gửi thực tế hiện ở mục “Trạng thái email”.',
  errorAlreadyMoved:
    'Yêu cầu này đã được xử lý bởi người khác. Vui lòng tải lại để xem trạng thái mới nhất.',
  errorNotFound: 'Không tìm thấy yêu cầu này.',
  errorNetwork: 'Không kết nối được tới hệ thống. Vui lòng thử lại.',
  errorServer: 'Đã có lỗi từ phía hệ thống. Vui lòng thử lại sau ít phút.',
};
