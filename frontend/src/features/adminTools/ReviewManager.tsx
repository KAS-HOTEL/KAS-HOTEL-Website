'use client';

import { useCallback, useState } from 'react';
import { ADMIN_LIST_PAGE_SIZE, reviewsApi } from '@/lib/api/endpoints/adminTools';
import type { GuestReview, ReviewAction } from '@/lib/domain/adminTools';
import { Badge, Button, Dialog, PageHeader } from '@/ui/primitives';
import { ListState, ListPagination } from './ListState';
import { adminError, useAdminList } from './useAdminList';
import styles from './AdminTools.module.css';

const ACTION_LABELS: Record<ReviewAction, string> = {
  APPROVE: 'Duyệt đánh giá', REJECT: 'Từ chối đánh giá',
  HIDE: 'Ẩn đánh giá', SHOW: 'Hiện lại đánh giá', DELETE: 'Xóa đánh giá',
};

function reviewState(row: GuestReview) {
  if (row.deletedAt) return { label: 'Đã xóa', tone: 'neutral' } as const;
  if (row.hiddenAt || row.status === 'HIDDEN') return { label: 'Đang ẩn', tone: 'neutral' } as const;
  if (row.status === 'PENDING') return { label: 'Chờ duyệt', tone: 'warning' } as const;
  if (row.status === 'APPROVED') return { label: 'Đã công bố', tone: 'success' } as const;
  if (row.status === 'REJECTED') return { label: 'Đã từ chối', tone: 'danger' } as const;
  return { label: row.status, tone: 'neutral' } as const;
}

export function ReviewManager() {
  const [draft, setDraft] = useState({ hotel: '', includeHidden: false });
  const [filter, setFilter] = useState(draft);
  const [page, setPage] = useState(0);
  const loader = useCallback(
    () => reviewsApi.list(filter.hotel, filter.includeHidden, page),
    [filter, page],
  );
  const { rows, loading, error, setError, reload } = useAdminList(loader);
  const [decision, setDecision] = useState<{ row: GuestReview; action: ReviewAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');

  function decide(row: GuestReview, action: ReviewAction) {
    setDecision({ row, action });
    setReason('');
    setActionError('');
  }

  async function saveDecision() {
    if (!decision || busy || !reason.trim()) return;
    setBusy(true);
    setActionError('');
    setError('');
    try {
      await reviewsApi.moderate(decision.row.id, decision.action, reason.trim());
      setDecision(null);
      await reload();
    } catch (caught) {
      setActionError(adminError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Khách hàng"
        title="Đánh giá của khách"
        description="Duyệt và quản lý các đánh giá hiển thị trên website."
      />

      <form className={styles.filters} aria-label="Lọc đánh giá" onSubmit={(event) => {
        event.preventDefault();
        setPage(0);
        setFilter({ ...draft, hotel: draft.hotel.trim() });
      }}>
        <label className={styles.filterField}>
          Mã khách sạn
          <input name="hotel" value={draft.hotel} placeholder="Tất cả khách sạn"
            onChange={(event) => setDraft({ ...draft, hotel: event.target.value })} />
        </label>
        <label className={styles.checkboxField}>
          <input type="checkbox" checked={draft.includeHidden}
            onChange={(event) => setDraft({ ...draft, includeHidden: event.target.checked })} />
          Bao gồm bài ẩn / đã xóa
        </label>
        <div className={styles.filterActions}>
          <Button type="submit" disabled={loading || busy}>Áp dụng</Button>
          <Button variant="secondary" disabled={loading || busy} onClick={() => void reload()}>Tải lại</Button>
        </div>
      </form>

      <section className={styles.results} aria-label="Danh sách đánh giá" aria-busy={loading}>
        <div className={styles.resultHeader}>
          <h2>Danh sách đánh giá</h2>
          {!loading && !error && <span>{rows.length} bài trên trang này</span>}
        </div>
        {loading || error || rows.length === 0 ? (
          <ListState loading={loading} error={error} onRetry={() => void reload()}
            errorTitle="Chưa tải được đánh giá" emptyTitle="Không có đánh giá phù hợp"
            emptyDescription="Thử thay đổi bộ lọc hoặc xem lại các bài đã ẩn." />
        ) : (
          <div className={styles.list}>
            {rows.map((row) => {
              const status = reviewState(row);
              return (
                <article key={row.id} className={styles.reviewCard}>
                  <div className={styles.reviewHead}>
                    <div className={styles.reviewIdentity}>
                      <span className={styles.rating}>{row.rating}<small>/5</small></span>
                      <div>
                        <strong>{row.hotelName || row.hotelKey}</strong>
                        <p className={styles.reviewMeta}>
                          {row.hotelName ? `${row.hotelKey} · ` : ''}
                          {row.language === 'vi' ? 'Tiếng Việt' : row.language === 'en' ? 'English' : row.language}
                          {row.stayMonth ? ` · Lưu trú ${row.stayMonth.substring(0, 7)}` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  {/* Tracing: which booking and which customer this review came from. */}
                  <dl className={styles.reviewTrace}>
                    <div><dt>Mã đặt phòng</dt><dd>{row.bookingReference || '—'}</dd></div>
                    <div>
                      <dt>Khách hàng</dt>
                      <dd>{row.customerName || '—'}{row.customerCode ? ` (${row.customerCode})` : ''}</dd>
                    </div>
                    {row.guestName && row.guestName !== row.customerName && (
                      <div><dt>Tên trên đặt phòng</dt><dd>{row.guestName}</dd></div>
                    )}
                    {row.submittedAt && (
                      <div>
                        <dt>Gửi lúc</dt>
                        <dd>{new Date(row.submittedAt).toLocaleString('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit',
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}</dd>
                      </div>
                    )}
                  </dl>
                  {row.title && <h3 className={styles.reviewTitle}>{row.title}</h3>}
                  <p className={styles.reviewBody}>{row.body}</p>
                  {!row.deletedAt && (
                    <div className={styles.reviewActions}>
                      <div className={styles.actionGroup}>
                        {row.status === 'PENDING' && <>
                          <Button disabled={busy} onClick={() => decide(row, 'APPROVE')}>Duyệt</Button>
                          <Button variant="secondary" disabled={busy} onClick={() => decide(row, 'REJECT')}>Từ chối</Button>
                        </>}
                        {row.status === 'APPROVED' && (
                          <Button variant="secondary" disabled={busy} onClick={() => decide(row, row.hiddenAt ? 'SHOW' : 'HIDE')}>
                            {row.hiddenAt ? 'Hiện lại' : 'Ẩn đánh giá'}
                          </Button>
                        )}
                      </div>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(row, 'DELETE')}>Xóa đánh giá</Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {!loading && !error && (rows.length > 0 || page > 0) && (
          <ListPagination page={page} hasNext={rows.length === ADMIN_LIST_PAGE_SIZE}
            onPrevious={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />
        )}
      </section>

      <Dialog open={decision !== null} title={decision ? ACTION_LABELS[decision.action] : 'Kiểm duyệt'}
        onClose={() => { if (!busy) setDecision(null); }}>
        <form className={`${styles.form} ${styles.editor}`} onSubmit={(event) => {
          event.preventDefault();
          void saveDecision();
        }}>
          <p className={styles.muted}>Quyết định và lý do sẽ được lưu trong lịch sử kiểm duyệt.</p>
          {decision?.action === 'REJECT' ? (
            <label>Lý do từ chối
              <select required value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)}>
                <option value="">Chọn lý do</option>
                <option value="ABUSIVE">Nội dung lăng mạ</option>
                <option value="OFF_TOPIC">Lạc đề</option>
                <option value="PERSONAL_DATA">Chứa dữ liệu cá nhân</option>
                <option value="SPAM">Spam</option>
                <option value="NOT_ABOUT_STAY">Không nói về kỳ lưu trú này</option>
              </select>
            </label>
          ) : (
            <label>Lý do<textarea required maxLength={500} value={reason} disabled={busy}
              onChange={(event) => setReason(event.target.value)} /></label>
          )}
          {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
          <div className={styles.dialogActions}>
            <Button variant="secondary" disabled={busy} onClick={() => setDecision(null)}>Hủy</Button>
            <Button type="submit" variant={decision?.action === 'DELETE' ? 'danger' : 'primary'}
              disabled={busy || !reason.trim()} loading={busy}>Lưu quyết định</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
