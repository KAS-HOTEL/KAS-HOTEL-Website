/* eslint-disable @next/next/no-img-element -- the media delivery host is deployment configuration, not known at build time; see the customer PropertyGallery. */
import Link from 'next/link';
import {
  displayName,
  isPubliclyVisible,
  UNNAMED_PROPERTY,
  type PropertyAdminView,
  type PropertyCompleteness,
} from '@/lib/domain/property';
import type { GalleryItem } from '@/lib/domain/media';
import type { RoomTypeView } from '@/lib/domain/roomType';
import { Tabs } from '@/ui/primitives';
import { PropertyPageHeader } from './PropertyPageHeader';
import { PublishPanel } from './PublishPanel';
import { SetupSteps, setupSteps } from './SetupSteps';
import { propertyTabs } from './tabs';
import styles from './Overview.module.css';

/**
 * The hotel, as its operator sees it.
 *
 * <h2>What this screen used to be</h2>
 *
 * A grid of six cards, one of which was titled "Thông tin hệ thống" and listed
 * the property's UUID, its slug, its raw `lifecycleState` enum value beside the
 * translated one, and its `sortOrder`. None of those is a fact about a hotel. A
 * hotelier opening their console met a database row.
 *
 * <p>They are gone from this screen. The id is still in the URL and the slug is
 * still on the customer-facing link, which is where each is actually useful;
 * neither is presented as something the operator is expected to read.
 *
 * <h2>What replaced it</h2>
 *
 * The questions an operator opens the console to answer — how many room types,
 * how many photographs, how far from being publishable — as three figures, then
 * one consolidated list of what is still missing, then the places to go and fix
 * it. Everything on the page is derived from a real response; nothing is
 * estimated and nothing is a placeholder.
 *
 * <p>A fourth figure counted the declared occupancy of every room type and
 * printed it as "8 khách". It is gone: it was labelled "Tổng số phòng" but
 * counted guests, and the hotel's real room count is per-date and lives on the
 * calendar.</p>
 *
 * <h2>Both locales still matter, but not as a card</h2>
 *
 * A hotel with a Vietnamese name and no English one cannot be published, so that
 * gap has to be visible. It is now a line in the task list — where every other
 * blocker is — rather than a card of its own competing with the room count.
 */
export function PropertyOverview({
  property,
  completeness,
  roomTypes,
  gallery,
  roomsWithoutPhotos = null,
}: {
  readonly property: PropertyAdminView;
  readonly completeness: PropertyCompleteness | null;
  /** The property's room types, for the counts. Empty when that read failed. */
  readonly roomTypes: readonly RoomTypeView[];
  /** The property's own photographs, for the cover and the count. */
  readonly gallery: readonly GalleryItem[];
  /** Room types with no photograph of their own; null when that could not be read. */
  readonly roomsWithoutPhotos?: number | null;
}) {
  const name = displayName(property.names);
  const at = (segment: string) => `/partner/properties/${property.id}${segment}`;

  /*
    A cover is only a cover if it has bytes behind it a browser can fetch.

    `MediaAssetView.url` is null when the deployment has no media delivery
    base configured, and the guard below was `cover === undefined` alone — so
    a present asset with a null url reached the `<img>` and rendered
    `src=""`. Per the HTML standard an empty `src` goes straight to the broken
    state, and with a non-empty `alt` the browser paints the hotel's own name,
    in a broken-image frame, as its hero. `PropertyMediaManager` already
    refuses to do this; this screen now agrees with it.
  */
  const cover = gallery.find((item) => item.link.isCover && item.asset.url !== null)
    ?? gallery.find((item) => item.asset.url !== null);
  const where = [property.district, property.city]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(', ');

  const publiclyVisible = isPubliclyVisible(property.lifecycleState);
  const tasks = outstandingTasks(property, completeness, roomTypes, gallery);
  const progress = completenessProgress(completeness);

  return (
    <div className={styles.overview}>
      <PropertyPageHeader
        propertyId={property.id}
        slug={property.slug}
        name={name}
        place={where}
        lifecycleState={property.lifecycleState}
      />

      <Tabs label="Khu vực quản lý khách sạn" items={propertyTabs(property.id)} activeId="overview" />

      {/*
        The hero. A hotel is a place, and the first thing its operator should see
        is the place — not a table of identifiers.
      */}
      <section className={styles.hero} aria-label="Khách sạn">
        {cover === undefined ? (
          // Not a grey rectangle pretending to be a photograph: an explicit
          // prompt, because "no cover yet" is a task rather than a decoration.
          <Link className={styles.heroEmpty} href={at('/media')}>
            <span className={styles.heroEmptyTitle}>Chưa có ảnh đại diện</span>
            <span className={styles.heroEmptyHint}>Tải ảnh lên</span>
          </Link>
        ) : (
          <div className={styles.heroImageWrap}>
            <img
              className={styles.heroImage}
              // Non-null by the selection above: an asset without a URL is
              // never chosen as the cover.
              src={cover.asset.url as string}
              alt={name ?? UNNAMED_PROPERTY}
              {...(cover.asset.width ? { width: cover.asset.width } : {})}
              {...(cover.asset.height ? { height: cover.asset.height } : {})}
              /* The one image above the fold on this screen, and the LCP
                 candidate. Everything else in the console is lazy; this is
                 the exception that earns priority. */
              fetchPriority="high"
              decoding="async"
            />
          </div>
        )}

        <div className={styles.heroBody}>
          <h2 className={styles.heroName}>{name ?? UNNAMED_PROPERTY}</h2>
          {where === '' ? (
            <p className={styles.heroPlaceUnset}>Chưa có địa chỉ</p>
          ) : (
            <p className={styles.heroPlace}>{where}</p>
          )}

          {property.signatureLines['vi'] === undefined ? null : (
            <p className={styles.heroLine}>{property.signatureLines['vi']}</p>
          )}

          <div className={styles.heroActions}>
            <Link className={styles.heroPrimary} href={at('/rooms')}>
              Loại phòng
            </Link>
            {/*
              Only when a guest could actually reach it. A link to a customer page
              that 404s is worse than no link.
            */}
            {publiclyVisible ? (
              <a
                className={styles.heroSecondary}
                href={`/vi/hotels/${property.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                Xem trang khách hàng
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {/* Three figures, all counted from real responses. */}
      <section className={styles.metrics} aria-label="Tổng quan số liệu">
        <Metric label="Loại phòng" value={String(roomTypes.length)} href={at('/rooms')} />
        <Metric label="Hình ảnh" value={String(gallery.length)} href={at('/media')} />
        <Metric
          label="Hoàn thiện hồ sơ"
          value={progress === null ? '—' : `${progress.done}/${progress.total}`}
          hint={progress === null ? 'Không tải được' : 'Mục đã hoàn tất'}
        />
      </section>

      {/*
        One list, not six cards. Every blocker an operator has, in one place,
        each linking to the screen that fixes it.
      */}
      {/* While the hotel is a draft, the order to set it up in (2026-11-08). */}
      {property.lifecycleState === 'DRAFT' ? (
        <SetupSteps
          steps={setupSteps({
            propertyId: property.id,
            informationComplete: completeness !== null && completeness.sections
              .filter((section) => !section.complete)
              .every((section) => sectionHref(section.name, property.id) !== at('/information')),
            galleryCount: gallery.length,
            hasCover: gallery.some((item) => item.link.isCover),
            roomTypeCount: roomTypes.length,
            roomsWithoutPhotos,
            published: false,
          })}
        />
      ) : null}

      <section className={styles.tasks} aria-labelledby="tasks-title">
        <div className={styles.tasksHead}>
          <h2 className={styles.sectionTitle} id="tasks-title">
            Việc cần làm
          </h2>
          <span className={styles.tasksCount}>
            {tasks.length === 0 ? 'Không còn việc nào' : `${tasks.length} việc`}
          </span>
        </div>

        {tasks.length === 0 ? (
          <p className={styles.tasksDone}>
            Hồ sơ khách sạn đã đầy đủ. Bạn có thể đưa khách sạn vào hoạt động bên dưới.
          </p>
        ) : (
          <ul className={styles.taskList}>
            {tasks.map((task) => (
              <li key={task.label} className={styles.task}>
                <span className={styles.taskLabel}>{task.label}</span>
                <Link className={styles.taskAction} href={task.href}>
                  {task.action}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.quickActions} aria-label="Thao tác nhanh">
        <QuickAction href={at('/rooms')} title="Quản lý loại phòng" hint="Sức chứa, giường, mô tả" />
        <QuickAction href={at('/media')} title="Hình ảnh" hint="Ảnh đại diện và thư viện" />
        <QuickAction href={at('/information')} title="Thông tin khách sạn" hint="Tên, mô tả, địa chỉ" />
      </section>

      {/*
        Activation, and only activation.

        This slot held `SubmitForReviewPanel` — sending the hotel to an Admin
        queue and waiting. In V1 there is one partner operational scope running
        the whole portfolio and Admin is not in the flow, so that step asked
        the operator to submit a hotel to themselves. `POST /publish` now
        accepts a DRAFT property and publishes its room types with it, so the
        Partner takes their own hotel live from here.

        The submission workflow is not gone: the endpoint, the queue and
        `SubmitForReviewPanel` all still exist and still work. It is simply no
        longer on the path, the same way `PublishPanel` was once taken off this
        screen and is now back on it.
      */}
      <div className={styles.lifecycle} id="publish">
        <PublishPanel property={property} completeness={completeness} />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  href,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly href?: string;
}) {
  const body = (
    <>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
      {hint === undefined ? null : <span className={styles.metricHint}>{hint}</span>}
    </>
  );

  return href === undefined ? (
    <div className={styles.metric}>{body}</div>
  ) : (
    <Link className={styles.metric} href={href}>
      {body}
    </Link>
  );
}

function QuickAction({
  href,
  title,
  hint,
}: {
  readonly href: string;
  readonly title: string;
  readonly hint: string;
}) {
  return (
    <Link className={styles.quickAction} href={href}>
      <span className={styles.quickActionTitle}>{title}</span>
      <span className={styles.quickActionHint}>{hint}</span>
    </Link>
  );
}

function completenessProgress(
  completeness: PropertyCompleteness | null,
): { readonly done: number; readonly total: number } | null {
  if (completeness === null) {
    return null;
  }
  return {
    done: completeness.sections.filter((section) => section.complete).length,
    total: completeness.sections.length,
  };
}

interface Task {
  readonly label: string;
  readonly action: string;
  readonly href: string;
}

/**
 * Everything standing between this hotel and a submission, in one list.
 *
 * <h2>The backend decides what is missing, not this function</h2>
 *
 * The section names and field names come from
 * `GET /admin/properties/{id}/completeness` — `PropertyCompletenessChecker`'s own
 * English strings — and are rendered verbatim. They are the same strings a
 * refused submit puts in its `details[]`, so an operator can match what they read
 * here against what the error said. A hand-maintained Vietnamese map would
 * silently fall back to nothing the day the backend adds a section (OQ-133).
 *
 * <p>The two rows this function adds itself are the ones the completeness
 * endpoint does not cover but the operator still has to act on: room types and
 * photographs, each of which has its own screen.
 */
function outstandingTasks(
  property: PropertyAdminView,
  completeness: PropertyCompleteness | null,
  roomTypes: readonly RoomTypeView[],
  gallery: readonly GalleryItem[],
): readonly Task[] {
  const at = (segment: string) => `/partner/properties/${property.id}${segment}`;
  const tasks: Task[] = [];

  if (roomTypes.length === 0) {
    tasks.push({ label: 'Chưa có loại phòng nào', action: 'Tạo loại phòng', href: at('/rooms') });
  }
  if (gallery.length === 0) {
    tasks.push({ label: 'Chưa có hình ảnh khách sạn', action: 'Tải ảnh lên', href: at('/media') });
  }

  for (const section of completeness?.sections ?? []) {
    if (section.complete) {
      continue;
    }
    tasks.push({
      // The backend's own words for the section, and its own words for each
      // missing field beneath it.
      label:
        section.missing.length === 0
          ? section.name
          : `${section.name}: ${section.missing.join(', ')}`,
      action: 'Bổ sung',
      href: sectionHref(section.name, property.id),
    });
  }

  return tasks;
}

/**
 * Which screen fixes a given completeness section.
 *
 * The names are the backend's English strings. Anything unrecognised — including
 * a section added later — falls back to the information screen, which is where
 * most property-level content is edited. A wrong-but-plausible destination is
 * better than a dead row, and the label still names exactly what is missing.
 */
function sectionHref(sectionName: string, propertyId: string): string {
  const at = (segment: string) => `/partner/properties/${propertyId}${segment}`;
  const name = sectionName.toLowerCase();
  if (name.includes('room')) {
    return at('/rooms');
  }
  if (name.includes('image') || name.includes('media') || name.includes('photo')) {
    return at('/media');
  }
  if (name.includes('polic')) {
    return at('/policies');
  }
  return at('/information');
}
