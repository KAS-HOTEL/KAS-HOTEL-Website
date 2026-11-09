import { Button, Skeleton } from '@/ui/primitives';
import { InboxIcon } from '@/ui/icons';
import styles from './AdminTools.module.css';

export function ListState({ loading, error, onRetry, errorTitle, emptyTitle, emptyDescription }: {
  readonly loading: boolean;
  readonly error: string;
  readonly onRetry: () => void;
  readonly errorTitle: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}) {
  if (loading) {
    return <div className={styles.loadingBox} role="status">
      <span className={styles.muted}>Đang tải dữ liệu…</span>
      <Skeleton height={14} width="55%" />
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="65%" />
    </div>;
  }
  return <div className={styles.stateBox} role={error ? 'alert' : 'status'}>
    <span className={`${styles.stateIcon} ${error ? styles.stateIconError : ''}`} aria-hidden="true">
      {error ? '!' : <InboxIcon size={22} />}
    </span>
    <h3>{error ? errorTitle : emptyTitle}</h3>
    <p>{error || emptyDescription}</p>
    {error && <Button variant="secondary" onClick={onRetry}>Thử lại</Button>}
  </div>;
}

export function ListPagination({ page, hasNext, onPrevious, onNext }: {
  readonly page: number;
  readonly hasNext: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  return <nav className={styles.pagination} aria-label="Phân trang danh sách">
    <span>Trang {page + 1}</span>
    <div className={styles.actionGroup}>
      <Button variant="secondary" disabled={page === 0} onClick={onPrevious}>Trang trước</Button>
      <Button variant="secondary" disabled={!hasNext} onClick={onNext}>Trang sau</Button>
    </div>
  </nav>;
}
