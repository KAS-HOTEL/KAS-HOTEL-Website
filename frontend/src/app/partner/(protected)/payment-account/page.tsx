import { PaymentAccountEditor } from '@/features/payment/PaymentAccountEditor';
import { PageHeader } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';

export const metadata = { title: 'Tài khoản thanh toán — KAS' };

/** SUPER_ADMIN: the one account every hotel's booking is paid into (V51). */
export default function Page() {
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Thanh toán"
        title="Tài khoản thanh toán"
        description="Khách trả qua cổng SePay (SePay tự tạo QR). Tài khoản chuyển khoản tay dưới đây là tuỳ chọn, dùng chung cho mọi khách sạn."
      />
      <PaymentAccountEditor />
    </div>
  );
}
