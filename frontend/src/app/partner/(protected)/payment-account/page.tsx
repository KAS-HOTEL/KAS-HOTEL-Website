import Link from 'next/link';
import { PageHeader } from '@/ui/primitives';

export const metadata = { title: 'Tài khoản thanh toán — KAS' };

/**
 * Hidden from the menu since 2026-11-12: guests pay through the SePay gateway. A bookmarked
 * link lands here instead of the old editor. Nothing is deleted: the stored account, its API
 * (/api/v1/admin/payment-account) and PaymentAccountEditor are kept for a later return.
 */
export default function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Thanh toán"
        title="Tài khoản thanh toán"
        description="Chức năng này đang tạm ẩn. Khách thanh toán qua cổng SePay: SePay tạo QR theo từng đơn và đặt phòng được xác nhận tự động khi tiền về."
      />
      <p>
        Dữ liệu tài khoản đã lưu được giữ nguyên. Để kiểm tra giao dịch SePay chưa khớp đơn, mở{' '}
        <Link href="/partner/unmatched-payments">Tiền chưa khớp đơn</Link>.
      </p>
    </div>
  );
}
