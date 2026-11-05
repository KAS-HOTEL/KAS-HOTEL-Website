import Link from 'next/link';
import type { MediaCoverView } from '@/lib/domain/media';
import { displayName, missingInformation, type PropertyAdminView } from '@/lib/domain/property';
import { Badge, Table, type Column } from '@/ui/primitives';
import { PropertyCover } from './PropertyCover';
import { PropertyStatus } from './PropertyStatus';
import { formatAddress } from './address';
import styles from './Property.module.css';

/**
 * The partner's properties.
 *
 * <h2>Why a table and not cards</h2>
 *
 * The brief allows either, decided by what the endpoint actually returns. Even
 * with identity restored (OQ-132) the response is seven scalars and a name map:
 * no summary, nothing editorial. Cards are for content that has something to
 * show; a card holding a name and a status badge is a table row with wasted
 * space around it.
 *
 * <p>The cover thumbnail does not change that. It arrives from a second read
 * (`GET /admin/media/covers`) rather than from this row, and it is sized as a
 * recognition cue in the identity cell — not as the picture a card would be
 * built around.
 *
 * <h2>Name first, slug beneath it</h2>
 *
 * The name is what an operator recognises a hotel by, so it leads. The slug stays
 * visible under it because it is the stable identifier that appears in URLs and
 * support requests, and because a property mid-onboarding may have no name at
 * all — in which case the slug is all there is, and the row says so rather than
 * inventing something from it.
 *
 * <h2>Nothing here counts to eight</h2>
 *
 * The component renders the rows it is given. Three, eight, nine or none — the
 * backend's scope query is the only thing that decides.
 */
export function PropertyTable({
  properties,
  covers,
  coversUnavailable = false,
  loading = false,
}: {
  readonly properties: readonly PropertyAdminView[];
  /** Cover per property id. A property with none is simply absent. */
  readonly covers?: ReadonlyMap<string, MediaCoverView> | undefined;
  readonly coversUnavailable?: boolean | undefined;
  readonly loading?: boolean;
}) {
  const columns: readonly Column<PropertyAdminView>[] = [
    {
      key: 'identity',
      header: 'Khách sạn',
      cell: (property) => {
        const name = displayName(property.names);
        return (
          // A link, not a row click handler: an operator must be able to open a
          // property in a new tab, and a keyboard user must reach it with Tab.
          <Link href={`/partner/properties/${property.id}`} className={styles.identity}>
            {/* Inside the link rather than in a column of its own: the picture
                and the name identify one hotel, and splitting them would put a
                second, unclickable cell between the row and its destination. */}
            <PropertyCover
              cover={covers?.get(property.id) ?? null}
              unavailable={coversUnavailable}
            />
            {/* The slug used to sit under the name. It is a routing key, not
                information an operator acts on, and printing it on every row
                made the column read as a database listing. It is still in the
                URL and still the public address; it is simply not furniture. */}
            <span className={styles.identityText}>
              {name === null ? (
                <span className={styles.unnamed}>Chưa đặt tên</span>
              ) : (
                <span className={styles.identityName}>{name}</span>
              )}
            </span>
          </Link>
        );
      },
    },
    {
      key: 'lifecycleState',
      header: 'Trạng thái',
      cell: (property) => <PropertyStatus state={property.lifecycleState} />,
    },
    {
      key: 'information',
      header: 'Thông tin',
      cell: (property) => {
        const missing = missingInformation(property);
        return missing.length === 0 ? (
          <Badge tone="success">Đã đủ</Badge>
        ) : (
          // `title` names them rather than a count alone, so the operator can
          // see what is outstanding without opening the property.
          <span className={styles.missingCount} title={missing.join(' · ')}>
            Thiếu {missing.length} mục
          </span>
        );
      },
    },
    {
      key: 'address',
      header: 'Địa chỉ',
      cell: (property) => formatAddress(property),
    },
    {
      key: 'phone',
      header: 'Điện thoại',
      cell: (property) =>
        property.phone === undefined ? (
          <span className={styles.none} aria-label="Chưa có">
            —
          </span>
        ) : (
          property.phone
        ),
    },
    {
      key: 'isFlagship',
      header: 'Nổi bật',
      cell: (property) =>
        property.isFlagship ? (
          <Badge tone="accent">Nổi bật</Badge>
        ) : (
          <span className={styles.none} aria-label="Không">
            —
          </span>
        ),
    },
    {
      key: 'sortOrder',
      header: 'Thứ tự',
      align: 'end',
      cell: (property) => property.sortOrder,
    },
  ];

  return (
    // Hidden below 768px, where PropertyCards renders the same rows in a shape a
    // phone can actually read. `display: none` takes it out of the accessibility
    // tree as well, so the two never both announce themselves.
    <div className={styles.tableOnly}>
    <Table
      caption="Khách sạn thuộc phạm vi của bạn"
      columns={columns}
      rows={properties}
      rowKey={(property) => property.id}
      loading={loading}
      emptyTitle="Chưa có khách sạn nào"
      emptyBody={
        // The note that used to stand here said creating a property was not
        // possible from the console and to contact KAS. `POST /admin/properties`
        // is wired up now, so the empty state offers the action instead of
        // apologising for its absence.
        <>
          Tài khoản này chưa có khách sạn nào.{' '}
          <Link href="/partner/properties/new">Thêm khách sạn đầu tiên</Link> để bắt đầu.
        </>
      }
    />
    </div>
  );
}
