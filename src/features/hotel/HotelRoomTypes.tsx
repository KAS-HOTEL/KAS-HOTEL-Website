import type { PublishedRoomType } from '@/lib/domain/availability';
import { RoomGallery } from './RoomGallery';
import type { PublicMediaView } from '@/lib/domain/media';
import styles from './Hotel.module.css';

/** Request descriptions and price estimates only; hotel staff checks rooms manually (decision 153). */
export function HotelRoomTypes({
  roomTypes,
  copy,
  galleries = {},
}: {
  readonly roomTypes: readonly PublishedRoomType[];
  readonly copy: RoomTypeCopy;
  /**
   * Each room type's published photographs, by slug. Defaulted so every existing
   * caller and test keeps working: a room with no entry simply shows no gallery.
   */
  readonly galleries?: Readonly<Record<string, readonly PublicMediaView[]>>;
}) {
  if (roomTypes.length === 0) {
    // A published hotel with no published room types is legitimate — doc 58
    // §3.1's own note — and mid-onboarding it is the normal state.
    return (
      <section className={styles.roomTypes} aria-labelledby="hotel-room-types">
        <h2 id="hotel-room-types" className={styles.sectionTitle}>{copy.heading}</h2>
        <p className={styles.roomTypeNote}>{copy.none}</p>
      </section>
    );
  }

  return (
    <section className={styles.roomTypes} aria-labelledby="hotel-room-types">
      <h2 id="hotel-room-types" className={styles.sectionTitle}>{copy.heading}</h2>
      {/* Said plainly, because the list itself cannot say it. */}
      <p className={styles.roomTypeNote}>{copy.notAvailability}</p>

      <ul className={styles.roomTypeList}>
        {roomTypes.map((room) => (
          <li key={room.slug} className={styles.roomType}>
            {/* The photographs the Partner uploaded and ordered, above the facts
                — a guest chooses a room by looking at it first. */}
            <RoomGallery images={galleries[room.slug] ?? []} roomName={room.name} />

            <div className={styles.roomTypeBody}>
            <h3 className={styles.roomTypeName}>{room.name}</h3>

            {/* The Partner's own sentence for this locale. Absent when unwritten:
                a room with no description shows its facts, not a substitute. */}
            {room.shortDescription === undefined || room.shortDescription === null
              || room.shortDescription === '' ? null : (
              <p className={styles.roomTypeLead}>{room.shortDescription}</p>
            )}

            <dl className={styles.roomTypeFacts}>
              <div className={styles.roomTypeFact}>
                <dt>{copy.occupancy}</dt>
                <dd>{occupancyLabel(room, copy)}</dd>
              </div>

              {/* Nullable in the schema: omitted, never shown as 0 m². */}
              {room.areaSqm === undefined || room.areaSqm === null ? null : (
                <div className={styles.roomTypeFact}>
                  <dt>{copy.area}</dt>
                  <dd>{room.areaSqm} m²</dd>
                </div>
              )}

              {room.viewType === undefined || room.viewType === null
                || room.viewType === '' ? null : (
                <div className={styles.roomTypeFact}>
                  <dt>{copy.view}</dt>
                  {/* The backend's own value when a type has no label, so a
                      value added to the enum later renders rather than vanishes. */}
                  <dd>{copy.views[room.viewType] ?? room.viewType}</dd>
                </div>
              )}

              {/* The Partner's own bed wording, counted. Omitted entirely when
                  none was recorded — a room mid-onboarding genuinely has none,
                  and "1 giường" would be a guess. */}
              {room.beds === undefined || room.beds.length === 0 ? null : (
                <div className={styles.roomTypeFact}>
                  <dt>{copy.beds}</dt>
                  <dd>
                    {room.beds.map((bed, index) => (
                      <span key={`${bed.bedType}-${index}`} className={styles.roomTypeBed}>
                        {copy.bed(bed.bedCount, bed.bedType)}
                        {bed.isDefault && (room.beds?.length ?? 0) > 1
                          ? ` (${copy.standardBed})`
                          : ''}
                      </span>
                    ))}
                  </dd>
                </div>
              )}

              {/* `smoking` is NOT NULL, so both states are facts and both are
                  stated. Silence would read as "not specified", which it is not. */}
              {room.smoking === undefined ? null : (
                <div className={styles.roomTypeFact}>
                  <dt>{copy.smoking}</dt>
                  <dd>{room.smoking ? copy.smokingAllowed : copy.smokingNotAllowed}</dd>
                </div>
              )}
            </dl>

            {/*
              The card closes on the action a guest came for. It moves to the
              date search rather than claiming a room is available: whether this
              room is free on given nights is the availability endpoint's answer,
              and no date has been chosen yet.
            */}
            <a href="#stay-search" className={styles.roomTypeChoose}>
              {copy.choose}
            </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * `2 adults · 1 child` — and `Sleeps 3` only when it says something the two
 * counts do not.
 *
 * The schema's `room_type_occupancy_fit` allows `maxOccupancy` to be lower than
 * adults plus children, so printing all three unconditionally would usually be
 * noise and occasionally a contradiction a guest has to resolve.
 */
function occupancyLabel(room: PublishedRoomType, copy: RoomTypeCopy): string {
  const parts = [copy.adults(room.maxAdults)];
  if (room.maxChildren > 0) {
    parts.push(copy.children(room.maxChildren));
  }
  const label = parts.join(' · ');
  return room.maxOccupancy === room.maxAdults + room.maxChildren
    ? label
    : `${label} · ${copy.sleeps(room.maxOccupancy)}`;
}

export interface RoomTypeCopy {
  readonly heading: string;
  readonly none: string;
  readonly notAvailability: string;
  readonly occupancy: string;
  readonly area: string;
  readonly view: string;
  readonly beds: string;
  readonly smoking: string;
  /** Two states, both stated — "not specified" is not one of them: the column is NOT NULL. */
  readonly smokingAllowed: string;
  readonly smokingNotAllowed: string;
  /** "1 × Giường đôi" — the Partner's own bed wording, counted. */
  readonly bed: (count: number, type: string) => string;
  readonly standardBed: string;
  readonly choose: string;
  readonly adults: (count: number) => string;
  readonly children: (count: number) => string;
  readonly sleeps: (count: number) => string;
  /** Label per frozen `view_type`. An unlabelled one falls back to its value. */
  readonly views: Readonly<Record<string, string>>;
}

/**
 * Guest copy in both frozen locales, following `requestMessages.ts`.
 *
 * The Vietnamese view labels are the console's own (`VIEW_TYPE_LABELS`), reused
 * so the two surfaces cannot drift; the English ones are the same five frozen
 * `view_type` values, one for one.
 */
const ROOM_TYPE_COPY: Readonly<Record<'vi' | 'en', RoomTypeCopy>> = {
  vi: {
    heading: 'Các loại phòng',
    none: 'Khách sạn chưa công bố loại phòng nào.',
    notAvailability:
      'Đây là các loại phòng của khách sạn. Chọn ngày ở phía trên để xem phòng nào còn trống và giá mỗi đêm.',
    occupancy: 'Sức chứa',
    area: 'Diện tích',
    view: 'Hướng nhìn',
    beds: 'Giường',
    smoking: 'Hút thuốc',
    smokingAllowed: 'Cho phép hút thuốc',
    smokingNotAllowed: 'Không hút thuốc',
    bed: (count, type) => `${count} × ${type}`,
    standardBed: 'tiêu chuẩn',
    choose: 'Chọn phòng',
    adults: (count) => `${count} người lớn`,
    children: (count) => `${count} trẻ em`,
    sleeps: (count) => `tối đa ${count} khách`,
    views: {
      CITY: 'Hướng thành phố',
      STREET: 'Hướng phố',
      COURTYARD: 'Hướng sân trong',
      ROOFTOP: 'Hướng sân thượng',
      INTERIOR: 'Không có cửa sổ ra ngoài',
    },
  },
  en: {
    heading: 'Room types',
    none: 'This hotel has not published any room types yet.',
    notAvailability:
      'These are the room types this hotel offers. Choose your dates above to see which are free and the nightly rate.',
    occupancy: 'Occupancy',
    area: 'Size',
    view: 'View',
    beds: 'Beds',
    smoking: 'Smoking',
    smokingAllowed: 'Smoking allowed',
    smokingNotAllowed: 'Non-smoking',
    bed: (count, type) => `${count} × ${type}`,
    standardBed: 'standard',
    choose: 'Choose room',

    adults: (count) => `${count} ${count === 1 ? 'adult' : 'adults'}`,
    children: (count) => `${count} ${count === 1 ? 'child' : 'children'}`,
    sleeps: (count) => `sleeps ${count}`,
    views: {
      CITY: 'City view',
      STREET: 'Street view',
      COURTYARD: 'Courtyard view',
      ROOFTOP: 'Rooftop view',
      INTERIOR: 'No outside window',
    },
  },
};

export function roomTypeCopy(locale: string): RoomTypeCopy {
  return locale === 'vi' ? ROOM_TYPE_COPY.vi : ROOM_TYPE_COPY.en;
}
