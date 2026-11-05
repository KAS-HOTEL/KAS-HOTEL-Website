'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mediaApi } from '@/lib/api/endpoints/media';
import { MEDIA_CATEGORIES, mediaCategoryLabel, type MediaOwnerType } from '@/lib/domain/media';
import { Button, Card } from '@/ui/primitives';
import { adminError } from '@/features/adminTools/useAdminList';
import { revalidateGallery, revalidateRoomGallery } from './actions';
import styles from '@/features/adminTools/AdminTools.module.css';

export function ExternalMediaForm({ propertyId, ownerId, ownerType, displayOrder, disabled = false }: {
  readonly propertyId: string; readonly ownerId: string; readonly ownerType: MediaOwnerType;
  readonly displayOrder: number; readonly disabled?: boolean;
}) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  return <Card title="Thêm ảnh bằng URL HTTPS">
    <p>Ảnh được dùng trực tiếp từ đường dẫn bạn cung cấp. Nhập mô tả ở cả hai ngôn ngữ trước khi xuất bản.</p>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      const url = String(data.get('url') ?? '').trim();
      try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error(); }
      catch { setError('Cần URL HTTPS đầy đủ, không chứa thông tin đăng nhập hoặc dấu #.'); return; }
      setBusy(true); setError(''); setNotice('');
      void mediaApi.external({ url, ownerType, ownerId, displayOrder,
        mimeType: String(data.get('mimeType')), category: String(data.get('category')),
        altTextVi: String(data.get('altVi') ?? '').trim(), altTextEn: String(data.get('altEn') ?? '').trim(),
      }).then(async () => {
        if (ownerType === 'PROPERTY') await revalidateGallery(propertyId); else await revalidateRoomGallery(propertyId, ownerId);
        form.reset(); setNotice('Đã thêm và xuất bản ảnh. Ảnh hiển thị với khách khi khách sạn / hạng phòng đã công khai.'); router.refresh();
      }).catch((caught: unknown) => setError(adminError(caught))).finally(() => setBusy(false));
    }}>
      <label>URL ảnh<input name="url" type="url" required maxLength={2048} placeholder="https://…" disabled={busy || disabled} /></label>
      <label>Định dạng<select name="mimeType" disabled={busy || disabled}><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="image/avif">AVIF</option></select></label>
      <label>Danh mục<select name="category" defaultValue={ownerType === 'ROOM_TYPE' ? 'ROOM' : 'EXTERIOR'} disabled={busy || disabled}>{(ownerType === 'ROOM_TYPE' ? ['ROOM'] : MEDIA_CATEGORIES).map((category) => <option value={category} key={category}>{mediaCategoryLabel(category)}</option>)}</select></label>
      <label>Mô tả ảnh tiếng Việt<input name="altVi" required maxLength={500} disabled={busy || disabled} /></label>
      <label>Mô tả ảnh tiếng Anh<input name="altEn" required maxLength={500} disabled={busy || disabled} /></label>
      <Button type="submit" loading={busy} disabled={disabled}>Thêm và xuất bản ảnh URL</Button>
    </form>{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
  </Card>;
}
