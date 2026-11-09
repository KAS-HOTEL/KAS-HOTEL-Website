import type { Metadata } from 'next';
import Link from 'next/link';
import { DashboardHotels } from '@/features/dashboard/DashboardHotels';
import { StatCard } from '@/features/dashboard/StatCard';
import { mediaCovers } from '@/features/media/server';
import { propertyList } from '@/features/property/server';
import { requireConsole } from '@/lib/auth/guard';
import { BuildingIcon, CheckIcon } from '@/ui/icons';
import { EmptyState, ErrorState, PageHeader } from '@/ui/primitives';
import dashboardStyles from '@/features/dashboard/Dashboard.module.css';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = { title: 'Tổng quan — KAS Admin' };

/**
 * The Admin overview: the hotels in scope and how many guests can see.
 *
 * Both figures are counted from the one list this page fetches; no analytics
 * endpoint exists. The submission queue left this page with the "Hồ sơ chờ duyệt"
 * screen (2026-11-08): Admin publishes a hotel from its own page once the
 * checklist is complete.
 */
export default async function AdminHome() {
  await requireConsole('ADMIN');
  const [properties, covers] = await Promise.all([propertyList(), mediaCovers('PROPERTY')]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Quản trị"
        title="Tổng quan"
        description="Khách sạn và hạng phòng, lấy trực tiếp từ hệ thống."
        actions={<Link href="/partner/properties/new">Thêm khách sạn</Link>}
      />

      <section className={dashboardStyles.stats} aria-label="Chỉ số quản trị">
        <StatCard
          label="Khách sạn"
          value={properties.status === 'ok' ? String(properties.properties.length) : null}
          note="Trong phạm vi của bạn"
          icon={<BuildingIcon />}
        />
        <StatCard
          label="Đã công bố"
          value={
            properties.status === 'ok'
              ? String(properties.properties.filter((p) => p.lifecycleState !== 'DRAFT').length)
              : null
          }
          note="Khách có thể thấy"
          icon={<CheckIcon />}
        />
      </section>

      <section aria-labelledby="admin-hotels" className={styles.pageHead}>
        <h2 className={styles.pageTitle} id="admin-hotels">Khách sạn & Hạng phòng</h2>
        {properties.status === 'error' ? (
          <ErrorState error={properties.error} />
        ) : properties.properties.length === 0 ? (
          <EmptyState title="Chưa có khách sạn nào">
            Tài khoản này chưa có khách sạn nào trong phạm vi được cấp.
          </EmptyState>
        ) : (
          <DashboardHotels
            properties={properties.properties}
            covers={covers.status === 'ok' ? covers.covers : undefined}
            coversUnavailable={covers.status === 'error'}
          />
        )}
      </section>
    </div>
  );
}
