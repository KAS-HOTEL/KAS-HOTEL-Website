'use client';
import { useCallback } from 'react';
import Link from 'next/link';
import { siteImageSlotsApi } from '@/lib/api/endpoints/siteImageSlots';
import { Button, Card, PageHeader } from '@/ui/primitives';
import { useAdminList } from './useAdminList';
import { slotGroupLabel } from '@/features/siteContent/groupLabels';
import styles from './AdminTools.module.css';

export function SectionMap() {
  const loader = useCallback(() => siteImageSlotsApi.adminList(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const groups = [...new Set(rows.map((slot) => slot.group))];
  return <div className={styles.page}>
    <PageHeader eyebrow="Nội dung website" title="Bản đồ section website"
      description="Danh mục vị trí ảnh đang được quản lý trên website."
      actions={<><Link className={styles.cardLink} href="/admin/content/images">Mở trang chỉnh sửa ảnh →</Link><Button variant="secondary" onClick={() => void reload()}>Tải lại</Button></>} />
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading ? <p role="status">Đang tải…</p> : !error && rows.length === 0 ? <p>Chưa có vị trí ảnh.</p> : !error && groups.map((group) => <Card key={group} title={`${slotGroupLabel(group)} · ${rows.filter((slot) => slot.group === group).length} vị trí`}>
      <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Vị trí</th><th>Section</th><th>Ảnh đang áp dụng</th><th>Trạng thái</th></tr></thead><tbody>{rows.filter((slot) => slot.group === group).sort((a,b) => a.sortOrder - b.sortOrder).map((slot) => <tr key={slot.key}><td>{slot.label}<br /><code>{slot.key}</code></td><td><code>{slot.selector}</code></td><td className={styles.body}>{slot.imageReference || 'Chưa đặt ảnh'}</td><td>{slot.enabled ? 'Bật' : 'Tắt'}</td></tr>)}</tbody></table></div>
    </Card>)}
  </div>;
}
