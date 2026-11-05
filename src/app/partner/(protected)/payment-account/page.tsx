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
        description="Một QR và một tài khoản ngân hàng cho mọi khách sạn, in vào email thanh toán gửi khách."
      />
      <PaymentAccountEditor />
    </div>
  );
}
