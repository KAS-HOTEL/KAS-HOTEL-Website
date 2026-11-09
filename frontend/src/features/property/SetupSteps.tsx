import Link from 'next/link';
import styles from './Overview.module.css';

export interface SetupStep {
  readonly label: string;
  readonly hint: string;
  readonly href: string;
  readonly done: boolean;
}

/**
 * The order a new hotel is set up in (owner decision, 2026-11-08): information,
 * photos and the Hero image, room types, room photos, then review and publish.
 *
 * Guidance only. Nothing here is required by the backend beyond what its own
 * publish checklist already requires; it never sets a minimum number of room
 * types and never publishes anything by itself.
 */
export function SetupSteps({ steps }: { readonly steps: readonly SetupStep[] }) {
  const next = steps.findIndex((step) => !step.done);
  return (
    <section className={styles.setup} aria-labelledby="setup-title">
      <div className={styles.tasksHead}>
        <h2 className={styles.sectionTitle} id="setup-title">Các bước thiết lập</h2>
        <span className={styles.tasksCount}>
          {steps.filter((step) => step.done).length}/{steps.length} bước
        </span>
      </div>
      <ol className={styles.setupList}>
        {steps.map((step, index) => (
          <li key={step.label} className={styles.setupStep} data-done={step.done || undefined}
            aria-current={index === next ? 'step' : undefined}>
            <span className={styles.setupNo} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
            <span className={styles.setupText}>
              <span className={styles.setupLabel}>
                {step.label}
                <span className="srOnly">{step.done ? ' — đã xong' : ' — chưa xong'}</span>
              </span>
              <span className={styles.setupHint}>{step.hint}</span>
            </span>
            <Link className={styles.taskAction} href={step.href}>{step.done ? 'Xem lại' : 'Thực hiện'}</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The five steps' state, from what the overview already loaded. */
export function setupSteps({
  propertyId,
  informationComplete,
  galleryCount,
  hasCover,
  roomTypeCount,
  roomsWithoutPhotos,
  published,
}: {
  readonly propertyId: string;
  readonly informationComplete: boolean;
  readonly galleryCount: number;
  readonly hasCover: boolean;
  readonly roomTypeCount: number;
  /** Room types with no photograph of their own; null when that could not be read. */
  readonly roomsWithoutPhotos: number | null;
  readonly published: boolean;
}): readonly SetupStep[] {
  const at = (segment: string) => `/partner/properties/${propertyId}${segment}`;
  return [
    {
      label: 'Thông tin khách sạn',
      hint: 'Tên, mô tả, địa chỉ, liên hệ',
      href: at('/information'),
      done: informationComplete,
    },
    {
      label: 'Ảnh khách sạn & ảnh Hero',
      hint: galleryCount === 0 ? 'Chưa có ảnh' : hasCover ? `${galleryCount} ảnh, đã chọn ảnh Hero` : `${galleryCount} ảnh, chưa chọn ảnh Hero`,
      href: at('/media'),
      done: galleryCount > 0 && hasCover,
    },
    {
      label: 'Hạng phòng',
      hint: roomTypeCount === 0 ? 'Chưa có hạng phòng' : `${roomTypeCount} hạng phòng`,
      href: at('/rooms'),
      done: roomTypeCount > 0,
    },
    {
      label: 'Ảnh hạng phòng',
      hint: roomTypeCount === 0 ? 'Thêm hạng phòng trước'
        : roomsWithoutPhotos === null ? 'Không đọc được ảnh hạng phòng'
          : roomsWithoutPhotos === 0 ? 'Mọi hạng phòng đều có ảnh'
            : `${roomsWithoutPhotos} hạng phòng chưa có ảnh`,
      href: at('/rooms'),
      done: roomTypeCount > 0 && roomsWithoutPhotos === 0,
    },
    {
      label: 'Kiểm tra & công bố',
      hint: published ? 'Khách sạn đã hiển thị cho khách' : 'Xem việc còn thiếu, rồi đưa vào hoạt động',
      href: `${at('')}#publish`,
      done: published,
    },
  ];
}
