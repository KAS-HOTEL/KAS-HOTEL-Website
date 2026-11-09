import Link from 'next/link';
import { messageFor } from '@/features/auth/messages';
import { dmy, formatVnd, summarize, todayInVietnam } from '@/features/pricing/pricing';
import styles from '@/features/pricing/Pricing.module.css';
import { PropertyStatus } from '@/features/property/PropertyStatus';
import { propertyList } from '@/features/property/server';
import { baseRates, rateGrid, specialRates } from '@/features/rate/server';
import { addDays } from '@/lib/domain/availability';
import { propertyLabel } from '@/lib/domain/property';
import { EmptyState, PageHeader } from '@/ui/primitives';

export const metadata = { title: 'Giá phòng — KAS Super Admin' };

const NIGHTS = 30;

/**
 * Room prices across every hotel (SUPER_ADMIN): one card per hotel with tonight's price
 * range, the next special rule, a 30-night price strip and what still has no price.
 */
export default async function PricingOverviewPage() {
  const list = await propertyList();
  const today = todayInVietnam();
  const to = addDays(today, NIGHTS - 1);

  if (list.status === 'error') {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Giá phòng" title="Giá phòng" />
        <EmptyState title="Chưa tải được danh sách khách sạn">{messageFor(list.error)}</EmptyState>
      </div>
    );
  }

  const cards = await Promise.all(list.properties.map(async (property) => {
    const [grid, base, specials] = await Promise.all([
      rateGrid(property.id, today, to),
      baseRates(property.id),
      specialRates(property.id),
    ]);
    const summary = grid.status === 'ok'
      ? summarize(grid.grid, base.status === 'ok' ? base.baseRates : [],
        specials.status === 'ok' ? specials.specialRates : [], today, NIGHTS)
      : null;
    return { property, rooms: grid.status === 'ok' ? grid.grid.rows.length : null, summary };
  }));

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Giá phòng"
        title="Giá phòng"
        description="Tình trạng giá của từng khách sạn trong 30 ngày tới. Bấm một khách sạn để mở lịch giá."
      />
      {cards.length === 0 ? (
        <EmptyState title="Chưa có khách sạn">Khách sạn do Admin tạo sẽ hiện ở đây.</EmptyState>
      ) : (
        <div className={styles.cards}>
          {cards.map(({ property, rooms, summary }) => {
            const peak = summary ? Math.max(1, ...summary.nightly.map((v) => v ?? 0)) : 1;
            return (
              <Link key={property.id} href={`/partner/pricing/${property.id}`} className={styles.card}>
                <span className={styles.cardHead}>
                  <h2>{propertyLabel(property.names)}</h2>
                  <PropertyStatus state={property.lifecycleState} />
                </span>
                {summary === null ? (
                  <span className={styles.hint}>Chưa tải được giá của khách sạn này.</span>
                ) : (
                  <>
                    <span className={styles.stat}>
                      <span>Giá tối nay</span>
                      <b>
                        {summary.tonightMin === null ? '—'
                          : summary.tonightMin === summary.tonightMax ? `${formatVnd(summary.tonightMin)} đ`
                            : `${formatVnd(summary.tonightMin)} – ${formatVnd(summary.tonightMax ?? summary.tonightMin)} đ`}
                      </b>
                    </span>
                    <span className={styles.stat}><span>Hạng phòng</span><b>{rooms}</b></span>
                    <span className={styles.stat}>
                      <span>Quy tắc đặc biệt sắp tới</span>
                      <b>{summary.next ? `${summary.next.name} (${dmy(summary.next.dateFrom ?? '')})` : '—'}</b>
                    </span>
                    <span className={styles.spark} aria-label="Giá trung bình mỗi đêm trong 30 ngày tới">
                      {summary.nightly.map((value, index) => (
                        <i key={index} data-gap={value === null || undefined}
                          style={{ height: `${value === null ? 100 : Math.max(15, (value / peak) * 100)}%` }} />
                      ))}
                    </span>
                    <span className={styles.issues}>
                      {summary.noBase > 0 ? (
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>{summary.noBase} hạng phòng chưa có giá cơ bản</span>
                      ) : null}
                      {summary.gaps > 0 ? (
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>{summary.gaps} đêm chưa có giá</span>
                      ) : rooms ? (
                        <span className={`${styles.badge} ${styles.badgeOk}`}>Đủ giá 30 ngày</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>Chưa có hạng phòng</span>
                      )}
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
