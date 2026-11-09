/* eslint-disable @next/next/no-img-element -- media delivery host is deployment configuration, not known at build time. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { PropertyMediaManager } from '@/features/media/PropertyMediaManager';
import { RoomMediaManager } from '@/features/media/RoomMediaManager';
import { mediaCovers, propertyGallery, roomGallery } from '@/features/media/server';
import { propertyList } from '@/features/property/server';
import { roomTypeList } from '@/features/roomType/server';
import { propertyLabel } from '@/lib/domain/property';
import { roomTypeName } from '@/lib/domain/roomType';
import { EmptyState, ErrorState, PageHeader, Tabs } from '@/ui/primitives';
import styles from '@/features/siteContent/SiteImages.module.css';

export const metadata: Metadata = { title: 'Ảnh khách sạn & hạng phòng — KAS Admin' };

type Tab = 'gallery' | 'rooms';

/** Thumbnails shown beside each room type in the list. */
const STRIP_PHOTOS = 4;

/**
 * Hotel and room-type images in one place (owner decision, 2026-11-08): pick a hotel, then
 * its gallery (Hero image, photos by category) or one of its room types. The editors are the
 * same components as on each hotel's own "Hình ảnh" tab; this screen only puts every hotel
 * side by side. Room photos stay separate from the hotel gallery.
 */
export default async function HotelImagesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly hotel?: string; readonly tab?: string; readonly room?: string }>;
}) {
  const query = await searchParams;
  const [list, covers] = await Promise.all([propertyList(), mediaCovers('PROPERTY')]);

  const header = (
    <PageHeader
      eyebrow="Nội dung website"
      title="Ảnh khách sạn & hạng phòng"
      description="Ảnh Hero, thư viện ảnh theo danh mục của từng khách sạn và ảnh từng hạng phòng. Ảnh Hero là ảnh đại diện của khách sạn ở mọi nơi trên website."
    />
  );

  if (list.status === 'error') {
    return <div className={styles.page}>{header}<ErrorState error={list.error} /></div>;
  }
  if (list.properties.length === 0) {
    return <div className={styles.page}>{header}<EmptyState title="Chưa có khách sạn">Thêm khách sạn trong “Khách sạn & Hạng phòng”.</EmptyState></div>;
  }

  const hotel = list.properties.find((p) => p.id === query.hotel) ?? list.properties[0]!;
  const tab: Tab = query.tab === 'rooms' ? 'rooms' : 'gallery';
  const coverMap = covers.status === 'ok' ? covers.covers : undefined;
  const at = (params: Record<string, string>) => `/admin/content/hotels?${new URLSearchParams({ hotel: hotel.id, ...params }).toString()}`;

  return (
    <div className={styles.page}>
      {header}
      <div className={styles.hotels}>
        <nav className={styles.hotelList} aria-label="Khách sạn">
          {list.properties.map((p) => {
            const cover = coverMap?.get(p.id);
            return (
              <Link key={p.id} href={`/admin/content/hotels?hotel=${p.id}`} className={styles.hotelItem}
                aria-current={p.id === hotel.id ? 'page' : undefined}>
                <span className={styles.hotelThumb}>{cover?.url ? <img src={cover.url} alt="" /> : null}</span>
                <span>
                  <strong>{propertyLabel(p.names).replace(/ Hotel$/, '')}</strong>
                  {coverMap && !cover ? <small><span className={styles.badge}>Chưa chọn ảnh Hero</span></small> : <small>Ảnh Hero đã chọn</small>}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.hotelPanel}>
          <div className={styles.hotelHead}>
            <div>
              <h2>{propertyLabel(hotel.names)}</h2>
              <p>Thông tin khách sạn và hạng phòng sửa trong “Khách sạn & Hạng phòng”.</p>
            </div>
            <Link className={styles.siteLink} href={`/partner/properties/${hotel.id}`}>Mở trang khách sạn →</Link>
          </div>
          <Tabs
            label="Loại ảnh"
            activeId={tab}
            items={[
              { id: 'gallery', label: 'Ảnh khách sạn', href: at({ tab: 'gallery' }) },
              { id: 'rooms', label: 'Ảnh hạng phòng', href: at({ tab: 'rooms' }) },
            ]}
          />
          {tab === 'gallery' ? <HotelGallery propertyId={hotel.id} /> : <RoomImages propertyId={hotel.id} roomId={query.room} at={at} />}
        </div>
      </div>
    </div>
  );
}

async function HotelGallery({ propertyId }: { readonly propertyId: string }) {
  const gallery = await propertyGallery(propertyId);
  if (gallery.status === 'error') return <ErrorState error={gallery.error} />;
  return <PropertyMediaManager propertyId={propertyId} items={gallery.items} library={gallery.library} />;
}

async function RoomImages({ propertyId, roomId, at }: {
  readonly propertyId: string;
  readonly roomId: string | undefined;
  readonly at: (params: Record<string, string>) => string;
}) {
  const rooms = await roomTypeList(propertyId);
  if (rooms.status === 'error') return <ErrorState error={rooms.error} />;
  if (rooms.roomTypes.length === 0) {
    return <EmptyState title="Khách sạn chưa có hạng phòng">Thêm hạng phòng trong “Khách sạn & Hạng phòng”, rồi quay lại để thêm ảnh.</EmptyState>;
  }
  // One read per room type for its photos: a hotel has a handful.
  const galleries = await Promise.all(rooms.roomTypes.map((room) => roomGallery(room.id)));
  const open = rooms.roomTypes.find((room) => room.id === roomId);
  const openIndex = open ? rooms.roomTypes.indexOf(open) : -1;
  const openGallery = openIndex >= 0 ? galleries[openIndex] : undefined;

  return (
    <div className={styles.rooms}>
      <p className={styles.note}>Ảnh hạng phòng tách riêng với thư viện khách sạn và chỉ hiện ở trang của hạng phòng đó. Chọn một hạng phòng để thêm hoặc sắp xếp ảnh.</p>
      {rooms.roomTypes.map((room, index) => {
        const gallery = galleries[index];
        const items = gallery?.status === 'ok' ? gallery.items : [];
        const name = roomTypeName(room.translations) ?? room.slug;
        const isOpen = room.id === open?.id;
        return (
          <div key={room.id} className={styles.rooms}>
            <Link href={isOpen ? at({ tab: 'rooms' }) : at({ tab: 'rooms', room: room.id })} className={styles.room}
              aria-current={isOpen ? 'page' : undefined} aria-expanded={isOpen}>
              <span>
                <strong>{name}</strong>
                {gallery?.status === 'error' ? <small>Không đọc được ảnh</small>
                  : items.length === 0 ? <small><span className={styles.badge}>Chưa có ảnh</span></small>
                    : <small>{items.length} ảnh</small>}
              </span>
              <span className={styles.strip} aria-hidden="true">
                {items.slice(0, STRIP_PHOTOS).map((item) => item.asset.url ? <img key={item.link.id} src={item.asset.url} alt="" /> : null)}
              </span>
            </Link>
            {isOpen && openGallery ? (
              <div className={styles.roomEditor}>
                {openGallery.status === 'error' ? <ErrorState error={openGallery.error} />
                  : <RoomMediaManager propertyId={propertyId} roomTypeId={room.id} roomTypeName={name} items={openGallery.items} />}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
