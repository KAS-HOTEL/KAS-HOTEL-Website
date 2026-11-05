'use client';
import { useState } from 'react';
import { tripRatingsApi } from '@/lib/api/endpoints/adminTools';
import { Button, Card } from '@/ui/primitives';
import { adminError } from './useAdminList';
import styles from './AdminTools.module.css';

export function TripRatingEditor({ propertyId }: { readonly propertyId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  return <Card title="Điểm Trip.com theo quý"><p>Nhập số liệu đã đối chiếu với nguồn Trip.com. Ngày đầu quý là 01/01, 01/04, 01/07 hoặc 01/10.</p>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const quarterStart = String(data.get('quarterStart'));
      if (!/^\d{4}-(01|04|07|10)-01$/.test(quarterStart)) { setError('Chọn ngày đầu quý hợp lệ.'); return; }
      setBusy(true); setError(''); setNotice('');
      void tripRatingsApi.save(propertyId, { quarterStart, rating: Number(data.get('rating')), reviewCount: Number(data.get('reviewCount')), sourceUrl: String(data.get('sourceUrl')), observedOn: String(data.get('observedOn')) }).then((result) => setNotice(`Đã lưu điểm ${result.rating}/10 cho quý bắt đầu ${result.quarterStart}.`)).catch((caught: unknown) => setError(adminError(caught))).finally(() => setBusy(false));
    }}>
      <label>Ngày đầu quý<input name="quarterStart" type="date" required /></label><label>Điểm / 10<input name="rating" type="number" min={0} max={10} step={0.1} required /></label>
      <label>Số đánh giá<input name="reviewCount" type="number" min={0} step={1} required /></label><label>Link nguồn<input name="sourceUrl" type="url" required /></label><label>Ngày đối chiếu<input name="observedOn" type="date" required /></label><Button type="submit" loading={busy}>Lưu điểm theo quý</Button>
    </form>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </Card>;
}
