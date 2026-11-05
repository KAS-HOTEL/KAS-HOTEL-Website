import type { PropertyCompleteness } from '@/lib/domain/property';
import { Badge, Card, EmptyState } from '@/ui/primitives';
import styles from './Property.module.css';

/**
 * Onboarding progress, from `GET /admin/properties/{id}/completeness`.
 *
 * <h2>The section names are the backend's</h2>
 *
 * "Basic information", "Location", "Room types", "Property images", "Signature
 * experiences" and the field names under them are returned as English strings by
 * `PropertyCompletenessChecker`. They are rendered verbatim rather than mapped
 * to a Vietnamese lookup, for two reasons: the same strings are what a refused
 * submit puts in its `details[]`, so an operator must be able to match what they
 * read here against what the error says; and a hand-maintained map would
 * silently fall back to nothing the day the backend adds a sixth section.
 *
 * Recorded as OQ-133 — the backend, not the frontend, is where those labels
 * should become bilingual.
 *
 * <h2>Read-only</h2>
 *
 * It shows what is missing. It does not offer to fix it and does not offer to
 * submit: `POST /{id}/submit` belongs to the onboarding step, and a submit
 * button here would be the one control on an overview page that changes state.
 */
export function CompletenessPanel({
  completeness,
}: {
  readonly completeness: PropertyCompleteness | null;
}) {
  if (completeness === null) {
    return (
      <Card title="Tiến độ hồ sơ">
        <EmptyState title="Không tải được tiến độ">
          Không thể lấy thông tin tiến độ hồ sơ lúc này. Thông tin khách sạn ở trên vẫn là dữ liệu
          thật từ hệ thống.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card
      title="Tiến độ hồ sơ"
      actions={
        completeness.complete ? (
          <Badge tone="success">Đã đủ điều kiện gửi duyệt</Badge>
        ) : (
          <Badge tone="warning">Chưa đủ điều kiện gửi duyệt</Badge>
        )
      }
    >
      <ul className={styles.sectionList}>
        {completeness.sections.map((section) => (
          <li key={section.name} className={styles.sectionItem}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionName}>{section.name}</span>
              {/* Text, not a tick glyph alone — the state has to survive
                  greyscale and be announced as words. */}
              <Badge tone={section.complete ? 'success' : 'neutral'}>
                {section.complete ? 'Hoàn tất' : 'Còn thiếu'}
              </Badge>
            </div>
            {section.missing.length === 0 ? null : (
              <ul className={styles.missingList}>
                {section.missing.map((field) => (
                  <li key={field} className={styles.missingItem}>
                    {field}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
