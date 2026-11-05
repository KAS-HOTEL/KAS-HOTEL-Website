'use client';
import { useState } from 'react';
import inventory from '../../../ADMIN_IMAGE_SOURCE_INVENTORY.json';
import { PageHeader } from '@/ui/primitives';
import styles from './AdminTools.module.css';

function Reference({ value }: { readonly value: string }) {
  let href: string | null = null;
  try { const url = new URL(value); if (url.protocol === 'https:') href = url.href; } catch { /* Local paths remain readable references. */ }
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{value}</a> : <span>{value}</span>;
}
export function ImageSources() {
  const [search, setSearch] = useState('');
  const needle = search.toLocaleLowerCase('vi');
  const photos = inventory.hotelGalleryStaticImages.filter((row) => JSON.stringify(row).toLocaleLowerCase('vi').includes(needle));
  const references = inventory.sourceReferences.filter((row) => JSON.stringify(row).toLocaleLowerCase('vi').includes(needle));
  return <div className={styles.page}>
    <PageHeader eyebrow="Nội dung website" title="Thư viện nguồn ảnh"
      description="Danh mục chỉ đọc từ bản admin cũ, dùng để đối chiếu nguồn ảnh. Thông tin xác minh bên dưới được giữ theo hồ sơ nguồn." />
    <label className={styles.searchField}>Tìm khách sạn, URL hoặc tệp<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <h2>Ảnh gallery khách sạn ({photos.length})</h2>
    <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Khách sạn / Danh mục</th><th>Ảnh và nguồn</th><th>Đối chiếu</th></tr></thead><tbody>{photos.map((row, index) => <tr key={`${row.hotelId}-${index}`}><td>{row.hotelId}<br />{row.category} · {row.index}</td><td className={styles.body}><Reference value={row.sourceIdOrUrl} /><br />{row.source}<br /><Reference value={row.sourceUrl} /></td><td>{row.verified ? 'Đã xác minh theo hồ sơ' : 'Chưa xác minh'}</td></tr>)}</tbody></table>{photos.length === 0 && <p>Không có ảnh phù hợp.</p>}</div>
    <h2>Tham chiếu trong mã nguồn cũ ({references.length})</h2>
    <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Tệp / Dòng</th><th>Loại</th><th>Tham chiếu</th></tr></thead><tbody>{references.map((row, index) => <tr key={index}><td>{row.file}:{row.line}</td><td>{row.kind}</td><td className={styles.body}><Reference value={row.reference} /></td></tr>)}</tbody></table></div>
  </div>;
}
