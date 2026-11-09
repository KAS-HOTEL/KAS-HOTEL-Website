import type { Metadata } from 'next';
import Link from 'next/link';
import { CreatePropertyForm } from '@/features/property/CreatePropertyForm';
import { propertyList } from '@/features/property/server';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  title: 'Thêm khách sạn — KAS Partner',
};

/**
 * Adding a hotel to the estate.
 *
 * <h2>Why the portfolio is read here</h2>
 *
 * Not to display it — to hand the form the slugs this partner has already used,
 * so a second "Kas Riverside Hotel" derives `kas-riverside-hotel-2` instead of
 * being refused by a uniqueness constraint the operator never sees and could not
 * act on. The read is request-memoised and the layout above already made it, so
 * this costs nothing.
 *
 * <p>A failed read is an error state rather than an empty list: an empty list
 * would silently disable the collision avoidance and produce a confusing refusal
 * on save.
 *
 * <h2>Not a wizard</h2>
 *
 * One screen, two sections, one save. The property lifecycle already has a
 * review step and a publish step; inserting a multi-step onboarding flow in
 * front of `POST /admin/properties` would invent a third that the backend has no
 * concept of.
 */
export default async function NewPropertyPage() {
  const result = await propertyList();

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <Link href="/partner/properties" className={styles.backLink}>
          ← Khách sạn
        </Link>
        <h1 className={styles.pageTitle}>Thêm khách sạn</h1>
        <p className={styles.pageIntro}>
          Tạo hồ sơ khách sạn mới. Bạn có thể bổ sung phòng, hình ảnh, giá và chính sách sau khi
          tạo.
        </p>
      </div>

      {result.status === 'error' ? (
        <ErrorState error={result.error} />
      ) : (
        <CreatePropertyForm existingSlugs={result.properties.map((property) => property.slug)} />
      )}
    </div>
  );
}
