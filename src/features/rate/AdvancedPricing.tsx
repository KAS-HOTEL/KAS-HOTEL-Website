'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BaseRateView, RateRuleView } from '@/lib/domain/rate';
import type { RoomTypeView } from '@/lib/domain/roomType';
import { Button, EmptyState, useToast } from '@/ui/primitives';
import { BaseRatePanel } from './BaseRatePanel';
import { BulkRateEditor } from './BulkRateEditor';
import { RateRulePanel } from './RateRulePanel';
import { revalidateRates } from './actions';
import styles from './Rate.module.css';

/**
 * Advanced pricing — standing prices, seasonal rules, bulk apply.
 *
 * <h2>Why this is a separate screen</h2>
 *
 * Daily work is one date, one room, one price and one room count, and that now
 * happens on **Lịch giá**. What is left here is the machinery behind
 * it: the base rate a night falls back to, the seasonal and campaign rules that
 * override it across a range, and the bulk apply that writes those rules.
 *
 * <p>None of it is daily, all of it is consequential, and all of it used to sit
 * underneath the calendar where an operator met a rules table before they could
 * change one night's price. Moving it behind a link is the whole point: the
 * primary workflow got shorter without the capability getting smaller.
 *
 * <h2>Nothing was deleted from the domain</h2>
 *
 * `rate_rule` is still resolved by `RateResolver` for every price the calendar
 * shows and every price a guest is quoted — doc 56 §3.1's precedence is
 * unchanged, and a day price set on the calendar still outranks a rule for that
 * date exactly as it did. This screen is the only way to see and manage rules,
 * which is precisely why it still exists.
 */
export function AdvancedPricing({
  propertyId,
  propertyName,
  roomTypes,
  rules,
  baseRates,
  from,
  to,
}: {
  readonly propertyId: string;
  readonly propertyName: string;
  readonly roomTypes: readonly RoomTypeView[];
  readonly rules: readonly RateRuleView[];
  readonly baseRates: readonly BaseRateView[];
  /** The range a bulk apply defaults to — carried from the calendar. */
  readonly from: string;
  readonly to: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [bulkOpen, setBulkOpen] = useState(false);

  async function refresh(): Promise<void> {
    await revalidateRates(propertyId);
    router.refresh();
  }

  if (roomTypes.length === 0) {
    return (
      <EmptyState title="Chưa có loại phòng nào">
        Giá được đặt theo từng loại phòng. Hãy tạo loại phòng trước.
      </EmptyState>
    );
  }

  return (
    <div className={styles.advancedPage}>
      <div className={styles.advancedIntro}>
        <p className={styles.advancedLead}>
          Đây là các công cụ nâng cao. Việc chỉnh giá theo ngày làm ở{' '}
          <Link href={`/partner/properties/${propertyId}/calendar`}>Lịch giá</Link>.
        </p>
        <div className={styles.advancedActions}>
          <Button onClick={() => setBulkOpen(true)}>Áp giá hàng loạt</Button>

        </div>
      </div>

      {/*
        Layer 0 first — doc 56 §3's fallback, the number that applies when no rule
        and no day price does. It is the thing to set before anything else, and
        an unpriced room type is omitted from guest availability entirely.
      */}
      <BaseRatePanel baseRates={baseRates} roomTypes={roomTypes} onChanged={refresh} />

      <section className={styles.advancedSection}>
        <div className={styles.advancedSectionHead}>
          <h2 className={styles.advancedSectionTitle}>Quy tắc giá theo mùa &amp; chiến dịch</h2>
          <p className={styles.advancedSectionNote}>
            Quy tắc áp dụng cho một khoảng ngày. Giá đặt riêng cho từng ngày ở lịch luôn được ưu
            tiên hơn quy tắc.
          </p>
        </div>
        <RateRulePanel rules={rules} roomTypes={roomTypes} onChanged={refresh} />
      </section>

      {bulkOpen ? (
        <BulkRateEditor
          propertyId={propertyId}
          propertyName={propertyName}
          roomTypes={roomTypes}
          from={from}
          to={to}
          onClose={() => setBulkOpen(false)}
          onApplied={async (effect) => {
            await refresh();
            toast.show(
              'success',
              `Đã áp dụng giá mới cho ${effect.cellsAffected} ô (${effect.roomTypes.length} loại phòng, ${effect.nights} ngày).`,
            );
          }}
        />
      ) : null}


    </div>
  );
}
