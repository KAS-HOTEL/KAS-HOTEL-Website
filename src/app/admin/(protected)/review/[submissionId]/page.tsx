import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompletenessPanel } from '@/features/property/CompletenessPanel';
import { DecisionPanel } from '@/features/review/DecisionPanel';
import { ReviewHistory, formatInstant } from '@/features/review/ReviewHistory';
import { reviewDetail } from '@/features/review/server';
import { displayName, lifecycleLabel, SUPPORTED_LOCALE_LABELS } from '@/lib/domain/property';
import { isOpen, submissionStatusLabel, submissionStatusTone } from '@/lib/domain/submission';
import { Badge, Breadcrumb, Card, ErrorState } from '@/ui/primitives';
import styles from '@/features/review/Review.module.css';
import propertyStyles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Constant: a title built from the property would differ between "absent" and
  // "out of scope" the moment either resolved.
  title: 'Duyệt hồ sơ — KAS Admin',
};

/**
 * The review workspace for one submission.
 *
 * <h2>Two columns, because reviewing is reading then deciding</h2>
 *
 * The property's content sits on the left and the decision stays beside it,
 * sticky, from 1100px. Below that the decision moves under the content — the
 * reading has to come first on a narrow screen, and a fixed action bar would eat
 * the room the content needs.
 *
 * <h2>What is shown is what the endpoints return</h2>
 *
 * The identity, editorial text and address come from `GET /admin/properties/{id}`
 * and the checklist from `/completeness` — the same authority the Partner's own
 * screens read, so an Admin and a Partner never see two different answers. There
 * is no partner name and no reviewer name anywhere on this page: the API returns
 * ids, and no route resolves them.
 */
export default async function AdminReviewDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly submissionId: string }>;
}) {
  const { submissionId } = await params;
  const result = await reviewDetail(submissionId);

  if (result.status === 'notFound') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Duyệt hồ sơ</h1>
        <ErrorState error={result.error} />
      </div>
    );
  }

  const { submission, property, completeness, history } = result;
  const name = property === null ? null : displayName(property.names);
  const open = isOpen(submission);

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: 'Hồ sơ chờ duyệt', href: '/admin/review' },
          { label: name ?? submission.propertyId },
        ]}
      />

      <header className={styles.pageHead}>
        <p className={styles.pageEyebrow}>Duyệt hồ sơ</p>
        <h1 className={styles.pageTitle}>{name ?? submission.propertyId}</h1>
        <p className={styles.pageLead}>
          Gửi lúc {formatInstant(submission.submittedAt)} ·{' '}
          <Badge tone={submissionStatusTone(submission.status)}>
            {submissionStatusLabel(submission.status)}
          </Badge>
        </p>
      </header>

      <div className={styles.workspace}>
        <div className={styles.column}>
          {property === null ? (
            // The submission loaded but the property did not. The decision is
            // still possible; the content simply cannot be shown.
            <Card title="Nội dung khách sạn">
              <p className={styles.pageLead}>
                Không tải được thông tin khách sạn. Bạn vẫn có thể xem lịch sử và ra quyết định.
              </p>
            </Card>
          ) : (
            <>
              <Card title="Định danh">
                <dl className={propertyStyles.definitions}>
                  {Object.entries(SUPPORTED_LOCALE_LABELS).map(([locale, label]) => (
                    <div key={locale} className={propertyStyles.definition}>
                      <dt>Tên ({label})</dt>
                      <dd>
                        {blank(property.names[locale]) ? (
                          <span className={propertyStyles.unset}>Chưa đặt</span>
                        ) : (
                          property.names[locale]
                        )}
                      </dd>
                    </div>
                  ))}
                  <div className={propertyStyles.definition}>
                    <dt>Định danh (slug)</dt>
                    <dd className={propertyStyles.mono}>{property.slug}</dd>
                  </div>
                  <div className={propertyStyles.definition}>
                    <dt>Trạng thái vòng đời</dt>
                    <dd>
                      {lifecycleLabel(property.lifecycleState)}{' '}
                      <span className={propertyStyles.mono}>({property.lifecycleState})</span>
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card title="Nội dung giới thiệu">
                <dl className={propertyStyles.definitions}>
                  {Object.entries(SUPPORTED_LOCALE_LABELS).map(([locale, label]) => (
                    <div key={`sig-${locale}`} className={propertyStyles.definition}>
                      <dt>Câu giới thiệu ({label})</dt>
                      <dd>
                        {blank(property.signatureLines[locale]) ? (
                          <span className={propertyStyles.unset}>Chưa đặt</span>
                        ) : (
                          property.signatureLines[locale]
                        )}
                      </dd>
                    </div>
                  ))}
                  {Object.entries(SUPPORTED_LOCALE_LABELS).map(([locale, label]) => (
                    <div key={`short-${locale}`} className={propertyStyles.definition}>
                      <dt>Mô tả ngắn ({label})</dt>
                      <dd>
                        {blank(property.shortDescriptions[locale]) ? (
                          <span className={propertyStyles.unset}>Chưa đặt</span>
                        ) : (
                          property.shortDescriptions[locale]
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card title="Địa chỉ">
                <dl className={propertyStyles.definitions}>
                  <div className={propertyStyles.definition}>
                    <dt>Phường/Xã</dt>
                    <dd>
                      {blank(property.ward) ? (
                        <span className={propertyStyles.unset}>Chưa đặt</span>
                      ) : (
                        property.ward
                      )}
                    </dd>
                  </div>
                  <div className={propertyStyles.definition}>
                    <dt>Quận/Huyện</dt>
                    <dd>
                      {blank(property.district) ? (
                        <span className={propertyStyles.unset}>Chưa đặt</span>
                      ) : (
                        property.district
                      )}
                    </dd>
                  </div>
                  <div className={propertyStyles.definition}>
                    <dt>Tỉnh/Thành phố</dt>
                    <dd>{property.city}</dd>
                  </div>
                  <div className={propertyStyles.definition}>
                    <dt>Toạ độ</dt>
                    <dd>
                      {property.latitude === undefined || property.longitude === undefined ? (
                        <span className={propertyStyles.unset}>Chưa đặt</span>
                      ) : (
                        <span className={propertyStyles.mono}>
                          {property.latitude}, {property.longitude}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>

              {/*
                The same panel the Partner sees, from the same endpoint. Rooms,
                media and experiences are counted by the backend's own checker —
                so this is where an Admin reads whether the gate is satisfied,
                rather than a second opinion computed here.
              */}
              <CompletenessPanel completeness={completeness} />

              <Card title="Xem chi tiết">
                <p className={styles.pageLead}>
                  Phòng, hình ảnh và chính sách của khách sạn này nằm trên các màn hình quản lý.{' '}
                  <Link href={`/partner/properties/${submission.propertyId}`}>
                    Mở hồ sơ khách sạn
                  </Link>
                  .
                </p>
              </Card>
            </>
          )}
        </div>

        <div className={`${styles.column} ${styles.aside}`}>
          {open ? (
            <DecisionPanel submission={submission} />
          ) : (
            <section className={styles.settled}>
              <h2 className={styles.decisionTitle}>Đã có quyết định</h2>
              <p className={styles.decisionHint}>
                Hồ sơ này đã được xử lý lúc{' '}
                {submission.reviewedAt === undefined
                  ? 'không rõ'
                  : formatInstant(submission.reviewedAt)}
                . Một hồ sơ đã quyết định không thể quyết định lại.
              </p>
              {submission.decisionReason === undefined ? null : (
                <p className={styles.historyReason}>{submission.decisionReason}</p>
              )}
            </section>
          )}

          <Card title="Lịch sử duyệt">
            <ReviewHistory history={history} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Absent, empty or whitespace all mean "not written yet". */
function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}
