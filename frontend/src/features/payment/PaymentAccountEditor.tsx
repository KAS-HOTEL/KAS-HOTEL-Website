'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { paymentAccountApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { Button } from '@/ui/primitives';
import styles from './PaymentAccountEditor.module.css';

/**
 * The one KAS account every booking is paid into (V51).
 *
 * Every hotel's payment email prints this QR and these bank details; there is no
 * per-hotel account any more. SUPER_ADMIN only — the backend refuses anyone else.
 */
export function PaymentAccountEditor() {
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    paymentAccountApi.get()
      .then((account) => {
        if (!active) return;
        setQrImageUrl(account.qrImageUrl ?? '');
        setInstructions(account.instructions ?? '');
        setBankName(account.bankName ?? '');
        setAccountHolder(account.accountHolder ?? '');
        setAccountNumber(account.accountNumber ?? '');
      })
      .catch(() => {
        if (active) setError('Không tải được tài khoản thanh toán. Hãy tải lại trang.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const account = await paymentAccountApi.update({
        qrImageUrl: qrImageUrl.trim() || null,
        instructions: instructions.trim() || null,
        bankName: bankName.trim() || null,
        accountHolder: accountHolder.trim() || null,
        accountNumber: accountNumber.trim() || null,
      });
      setQrImageUrl(account.qrImageUrl ?? '');
      setInstructions(account.instructions ?? '');
      setBankName(account.bankName ?? '');
      setAccountHolder(account.accountHolder ?? '');
      setAccountNumber(account.accountNumber ?? '');
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError
        ? 'Không lưu được thông tin. Kiểm tra đường dẫn QR và số tài khoản (4–40 chữ số hoặc chữ cái) rồi thử lại.'
        : 'Không thể kết nối tới hệ thống. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="payment-account-title">
      <h2 className={styles.title} id="payment-account-title">Tài khoản nhận tiền chung</h2>
      <p className={styles.note}>
        Mọi khách sạn dùng chung một tài khoản. Sau khi xác nhận còn phòng, hệ thống gửi QR và thông tin chuyển khoản này
        cho khách qua email. Đặt phòng chỉ được xác nhận sau khi kiểm tra đã nhận tiền.
      </p>
      {loading ? <p className={styles.note}>Đang tải thông tin…</p> : (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span>Đường dẫn ảnh QR thanh toán</span>
            <input
              type="url"
              inputMode="url"
              maxLength={2048}
              placeholder="https://…"
              value={qrImageUrl}
              onChange={(event) => { setQrImageUrl(event.target.value); setSaved(false); }}
            />
            <small>Đưa ảnh QR lên nơi lưu trữ công khai rồi dán đường dẫn ảnh vào đây. Thiếu QR thì không gửi được email thanh toán.</small>
          </label>
          {qrImageUrl ? <img className={styles.qrPreview} src={qrImageUrl} alt="Xem trước QR thanh toán" /> : null}
          <label className={styles.field}>
            <span>Ngân hàng</span>
            <input
              maxLength={120}
              placeholder="Ví dụ: Vietcombank — CN Sài Gòn"
              value={bankName}
              onChange={(event) => { setBankName(event.target.value); setSaved(false); }}
            />
          </label>
          <label className={styles.field}>
            <span>Chủ tài khoản</span>
            <input
              maxLength={120}
              autoComplete="off"
              value={accountHolder}
              onChange={(event) => { setAccountHolder(event.target.value); setSaved(false); }}
            />
          </label>
          <label className={styles.field}>
            <span>Số tài khoản</span>
            <input
              maxLength={40}
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9A-Za-z .-]{4,40}"
              value={accountNumber}
              onChange={(event) => { setAccountNumber(event.target.value); setSaved(false); }}
            />
            <small>Ba ô này được in vào email thanh toán gửi khách. Để trống thì email ghi “xem thông tin trên mã QR”.</small>
          </label>
          <label className={styles.field}>
            <span>Hướng dẫn chuyển khoản</span>
            <textarea
              maxLength={2000}
              rows={4}
              placeholder="Lưu ý thêm cho khách…"
              value={instructions}
              onChange={(event) => { setInstructions(event.target.value); setSaved(false); }}
            />
          </label>
          <div className={styles.actions}>
            <Button type="submit" disabled={saving || loading}>
              {saving ? 'Đang lưu…' : 'Lưu tài khoản thanh toán'}
            </Button>
            {saved ? <p className={styles.status} role="status">Đã lưu. Email thanh toán của mọi khách sạn dùng thông tin này.</p> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </div>
        </form>
      )}
    </section>
  );
}
