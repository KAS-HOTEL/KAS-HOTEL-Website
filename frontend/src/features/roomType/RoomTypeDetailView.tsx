import {
  isRoomTypePubliclyVisible,
  roomTypeName,
  roomTypeStatusLabel,
  viewTypeLabel,
  type RoomTypeView,
} from '@/lib/domain/roomType';
import { SUPPORTED_LOCALE_LABELS } from '@/lib/domain/property';
import { Badge, Card, EmptyState, Tabs, type TabItem } from '@/ui/primitives';
import Link from 'next/link';
import { RoomTypeStatusBadge } from './RoomTypeStatusBadge';
import styles from './RoomType.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * One room type, read-only.
 *
 * <h2>No action that the backend would refuse</h2>
 *
 * There is no publish control, and there is not going to be one:
 * `RoomTypeStatus.isPartnerPermittedTransition` refuses `PUBLISHED` for a
 * Partner outright, because publishing adds content to a live property and doing
 * it without review would route around the approval workflow entirely. The page
 * therefore *states* how publication happens rather than offering a button that
 * would come back 409.
 *
 * Nothing else is editable either — authoring room types is a later step, and
 * this screen has no form, no submit and no status control.
 *
 * <h2>Ready for what comes next, without pretending to have it</h2>
 *
 * The sub-navigation names the screens this room will eventually own — inventory,
 * rates, gallery — as disabled entries. Their endpoints exist and are tested; the
 * screens do not, and a tab that navigated to a placeholder would be
 * indistinguishable at a glance from one that is broken.
 */
export function RoomTypeDetailView({
  propertyId,
  roomType,
}: {
  readonly propertyId: string;
  readonly roomType: RoomTypeView;
}) {
  const name = roomTypeName(roomType.translations);

  return (
    <div className={propertyStyles.detail}>
      <header className={propertyStyles.detailHeader}>
        <div className={propertyStyles.detailIdentity}>
          <h1 className={propertyStyles.detailTitle}>{name ?? roomType.slug}</h1>
          <p className={propertyStyles.detailSlug}>{roomType.slug}</p>
        </div>
        <div className={propertyStyles.detailBadges}>
          <RoomTypeStatusBadge status={roomType.status} />
          {roomType.smoking ? <Badge tone="warning">Cho phép hút thuốc</Badge> : null}
          {/* Edit only. There is deliberately no status control here: a Partner
              may never publish, and PATCH /{id}/status is not even wrapped. */}
          <Link
            href={`/partner/properties/${propertyId}/rooms/${roomType.id}/edit`}
            className={propertyStyles.primaryLink}
          >
            Chỉnh sửa
          </Link>
        </div>
      </header>

      <Tabs label="Khu vực quản lý loại phòng" items={roomTypeTabs(propertyId, roomType.id)} activeId="overview" />

      <div className={propertyStyles.detailGrid}>
        <Card title="Tên và mô tả">
          <dl className={propertyStyles.definitions}>
            {Object.entries(SUPPORTED_LOCALE_LABELS).map(([locale, label]) => {
              const translation = roomType.translations[locale];
              return (
                <div key={locale} className={propertyStyles.definition}>
                  <dt>{label}</dt>
                  <dd>
                    {translation === undefined ? (
                      <span className={propertyStyles.unset}>Chưa đặt</span>
                    ) : (
                      <>
                        {translation.name}
                        {translation.shortDescription === undefined ? null : (
                          <span className={styles.shortDescription}>
                            {translation.shortDescription}
                          </span>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>

        <Card title="Sức chứa">
          <dl className={propertyStyles.definitions}>
            <Row label="Tối đa" value={`${roomType.maxOccupancy} khách`} />
            <Row label="Người lớn" value={`${roomType.maxAdults}`} />
            <Row label="Trẻ em" value={`${roomType.maxChildren}`} />
            {/* max_occupancy <= max_adults + max_children is a CHECK, not an
                identity, so the three numbers are shown rather than summarised. */}
          </dl>
        </Card>

        <Card title="Cấu hình giường">
          {roomType.beds.length === 0 ? (
            <EmptyState title="Chưa cấu hình giường">
              Loại phòng này chưa khai báo cấu hình giường nào.
            </EmptyState>
          ) : (
            <ul className={styles.bedList}>
              {[...roomType.beds]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((bed) => (
                  <li key={`${bed.sortOrder}-${bed.bedType}`} className={styles.bedItem}>
                    <span>
                      {bed.bedCount} × {bed.bedType}
                    </span>
                    {bed.isDefault ? <Badge tone="info">Mặc định</Badge> : null}
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="Thông tin phòng">
          <dl className={propertyStyles.definitions}>
            <Row
              label="Hướng nhìn"
              value={roomType.viewType === undefined ? null : viewTypeLabel(roomType.viewType)}
            />
            <Row
              label="Diện tích"
              value={roomType.areaSqm === undefined ? null : `${roomType.areaSqm} m²`}
            />
            <Row label="Hút thuốc" value={roomType.smoking ? 'Được phép' : 'Không được phép'} />
            <Row label="Thứ tự hiển thị" value={`${roomType.sortOrder}`} />
            <div className={propertyStyles.definition}>
              <dt>Mã loại phòng</dt>
              <dd className={propertyStyles.mono}>{roomType.id}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Tiện nghi">
          {roomType.amenityCodes.length === 0 ? (
            <EmptyState title="Chưa chọn tiện nghi">
              Loại phòng này chưa gắn tiện nghi nào từ danh mục chung.
            </EmptyState>
          ) : (
            <ul className={styles.amenityList}>
              {roomType.amenityCodes.map((code) => (
                // The backend's own codes, verbatim. There is no public endpoint
                // returning amenity labels (doc 100 §10), so translating them here
                // would mean inventing a vocabulary nobody has approved.
                <li key={code} className={styles.amenityItem}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hiển thị công khai">
          <dl className={propertyStyles.definitions}>
            <Row
              label="Trạng thái"
              value={`${roomTypeStatusLabel(roomType.status)} (${roomType.status})`}
            />
            <Row
              label="Khách có thấy không"
              value={
                isRoomTypePubliclyVisible(roomType.status)
                  ? 'Có — loại phòng này hiển thị trên trang khách.'
                  : 'Không — loại phòng này chưa hiển thị với khách.'
              }
            />
          </dl>
          <p className={styles.publishNote}>
            {/* Requirement: the UI must never imply the Partner can publish. */}
            Đối tác không thể tự đăng loại phòng lên trang công khai. Việc hiển thị công khai chỉ
            diễn ra khi khách sạn được duyệt, để mọi nội dung mới đều đi qua khâu kiểm duyệt.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className={propertyStyles.definition}>
      <dt>{label}</dt>
      <dd>{value === null ? <span className={propertyStyles.unset}>Chưa đặt</span> : value}</dd>
    </div>
  );
}

/**
 * The areas a room type will eventually own.
 *
 * Only the overview exists. Inventory, rates and gallery all have working,
 * tested backend endpoints and no per-room screens yet, so they are named — an
 * operator can see where the feature is going — and disabled.
 *
 * <p>The labels no longer carry the step number that would build each one. A
 * release number tells the people writing the product something and tells a
 * hotel operator nothing; the disabled state already says the screen is not
 * ready. Named and greyed out is the honest amount to say.
 */
function roomTypeTabs(propertyId: string, roomTypeId: string): readonly TabItem[] {
  const at = (segment: string) =>
    `/partner/properties/${propertyId}/rooms/${roomTypeId}${segment}`;
  return [
    { id: 'overview', label: 'Tổng quan', href: at('') },
    // Enabled in STEP H: the room gallery is real — upload, reorder, set the
    // primary photo — and it is where a room is finished, so it is not greyed
    // out beside the tabs that still have no screen behind them.
    { id: 'gallery', label: 'Hình ảnh', href: at('/media') },
    { id: 'rates', label: 'Giá', href: at('/rates'), disabled: true },
  ];
}
