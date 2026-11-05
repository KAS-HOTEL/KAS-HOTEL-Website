'use client';
/* eslint-disable @next/next/no-img-element -- URLs may belong to owner-approved external hosts. */
import { useCallback } from 'react';
import Link from 'next/link';
import { propertiesApi } from '@/lib/api/endpoints/properties';
import { mediaApi } from '@/lib/api/endpoints/media';
import { Button, Card, PageHeader } from '@/ui/primitives';
import { useAdminList } from './useAdminList';
import styles from './AdminTools.module.css';

export function CollectionOverview() {
  const loader = useCallback(async () => {
    const [properties, covers] = await Promise.all([propertiesApi.list(), mediaApi.covers('PROPERTY')]);
    return properties.map((property) => ({ property, cover: covers.find((cover) => cover.ownerId === property.id) }));
  }, []);
  const { rows, loading, error, reload } = useAdminList(loader);
  return <div className={styles.page}>
    <PageHeader eyebrow="Nội dung website" title="KAS Collection"
      description="Ảnh đại diện của toàn bộ khách sạn. Mở thư viện để chọn ảnh bìa hoặc sắp xếp gallery."
      actions={<Button variant="secondary" onClick={() => void reload()}>Tải lại</Button>} />
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading ? <p role="status">Đang tải…</p> : !error && <div className={styles.grid}>{rows.map(({ property, cover }) => <Card key={property.id} title={property.names.vi ?? property.names.en ?? property.slug}>
      {cover?.url ? <img className={styles.image} src={cover.url} alt={property.names.vi ?? property.slug} referrerPolicy="no-referrer" /> : <p>Chưa có ảnh bìa xem trước.</p>}
      <Link className={styles.cardLink} href={`/partner/properties/${property.id}/media`}>Quản lý ảnh khách sạn →</Link>
    </Card>)}{rows.length === 0 && <p>Chưa có khách sạn.</p>}</div>}
  </div>;
}
