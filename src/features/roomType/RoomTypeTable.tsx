import Link from 'next/link';
import { formatBeds, roomTypeName, viewTypeLabel, type RoomTypeView } from '@/lib/domain/roomType';
import { Table, type Column } from '@/ui/primitives';
import { RoomTypeStatusBadge } from './RoomTypeStatusBadge';
import styles from './RoomType.module.css';

/**
 * The room types of one property.
 *
 * A table for the same reason the property list is one: the response is a set of
 * scalars and short lists with no imagery attached — media lives on a separate
 * endpoint and is a later step — so cards would be table rows with space around
 * them.
 *
 * <h2>Occupancy is shown as the backend states it</h2>
 *
 * `maxAdults`, `maxChildren` and `maxOccupancy` are three separate numbers, and
 * `max_occupancy <= max_adults + max_children` is a CHECK rather than an
 * identity — so a room can take 2 adults and 2 children with a maximum of 3.
 * Collapsing them into one figure would quietly assert the sum, which the schema
 * explicitly does not.
 *
 * <h2>No price, ever</h2>
 *
 * The API does not return one (doc 52 §3.2 keeps it in `pricing`), so no column
 * here can show one. Rates are a later step and will have their own screen.
 */
export function RoomTypeTable({
  propertyId,
  roomTypes,
  loading = false,
}: {
  readonly propertyId: string;
  readonly roomTypes: readonly RoomTypeView[];
  readonly loading?: boolean;
}) {
  const columns: readonly Column<RoomTypeView>[] = [
    {
      key: 'identity',
      header: 'Loại phòng',
      cell: (roomType) => {
        const name = roomTypeName(roomType.translations);
        return (
          <Link
            href={`/partner/properties/${propertyId}/rooms/${roomType.id}`}
            className={styles.identity}
          >
            {name === null ? (
              <span className={styles.unnamed}>Chưa đặt tên</span>
            ) : (
              <span className={styles.identityName}>{name}</span>
            )}
            <span className={styles.identitySlug}>{roomType.slug}</span>
          </Link>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (roomType) => <RoomTypeStatusBadge status={roomType.status} />,
    },
    {
      key: 'occupancy',
      header: 'Sức chứa',
      cell: (roomType) => (
        <span className={styles.occupancy}>
          {roomType.maxOccupancy} khách
          <span className={styles.occupancyBreakdown}>
            {roomType.maxAdults} người lớn · {roomType.maxChildren} trẻ em
          </span>
        </span>
      ),
    },
    {
      key: 'beds',
      header: 'Giường',
      cell: (roomType) =>
        roomType.beds.length === 0 ? <Absent label="Chưa cấu hình" /> : formatBeds(roomType.beds),
    },
    {
      key: 'view',
      header: 'Hướng nhìn',
      cell: (roomType) =>
        roomType.viewType === undefined ? (
          <Absent label="Chưa đặt" />
        ) : (
          viewTypeLabel(roomType.viewType)
        ),
    },
    {
      key: 'areaSqm',
      header: 'Diện tích',
      align: 'end',
      cell: (roomType) =>
        roomType.areaSqm === undefined ? <Absent label="Chưa đặt" /> : `${roomType.areaSqm} m²`,
    },
  ];

  return (
    // Hidden below 768px, where RoomTypeCards renders the same rows in a shape a
    // phone can read without scrolling sideways. Setting display to none takes it
    // out of the accessibility tree too, so the two never both announce
    // themselves.
    <div className={styles.tableOnly}>
      <Table
        caption="Loại phòng của khách sạn này"
        columns={columns}
        rows={roomTypes}
        rowKey={(roomType) => roomType.id}
        loading={loading}
        emptyTitle="Khách sạn này chưa có loại phòng nào"
        emptyBody={
          // Every one of the eight seed properties is in this state, so this is
          // the state an operator will actually meet first. It has to explain the
          // concept and the route forward rather than looking like a failure.
          <>
            Loại phòng là sản phẩm khách đặt — ví dụ “Phòng Deluxe Giường King” — gồm sức chứa, cấu
            hình giường, hướng nhìn và tiện nghi. Mỗi khách sạn cần ít nhất một loại phòng trước
            khi có thể gửi duyệt. Việc tạo và chỉnh sửa loại phòng sẽ có ở bước tiếp theo; màn hình
            này hiện chỉ để xem.
          </>
        }
      />
    </div>
  );
}

/** A field the Partner has not filled in yet — a dash with a label, not a blank cell. */
function Absent({ label }: { readonly label: string }) {
  return (
    <span className={styles.none} aria-label={label}>
      —
    </span>
  );
}
