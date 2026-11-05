import type { Metadata } from 'next';
import Link from 'next/link';
import { AUTOMATION_LOG_COPY, AutomationLog } from '@/features/messaging/AutomationLog';
import { TEMPLATE_COPY, TemplateManager } from '@/features/messaging/TemplateManager';
import { automationLog, templates } from '@/features/messaging/server';
import { hotelOptions } from '@/features/reservation/hotelOptions';
import { Card, ErrorState } from '@/ui/primitives';
import styles from '@/features/messaging/Messaging.module.css';

export const metadata: Metadata = {
  title: 'Tin nhắn mẫu — KAS Partner',
};

/**
 * Message templates and the automation they can drive.
 *
 * <h2>One screen, because they are one decision</h2>
 *
 * A template's body and its trigger are written together, and the switch that
 * turns it into an automation sits on the same row — so an operator can see what
 * is enabled and what it will say without moving between screens. The execution
 * log is below them for the same reason: "is the reminder working?" is answered
 * by looking at what it has written.
 *
 * <h2>Only the one trigger the backend can observe</h2>
 *
 * `BEFORE_CHECK_IN` is a date comparison the scheduler already makes. The stay
 * lifecycle's other transitions are not offered: doc 58 §6's `/check-in`,
 * `/check-out` and `/no-show` routes are unimplemented and there is no
 * domain-event pipeline, so a template on one would be a switch that never fires.
 */
export default async function PartnerMessageTemplatesPage() {
  const [shelf, log, list] = await Promise.all([templates(), automationLog(), hotelOptions()]);

  const properties = list;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Tin nhắn mẫu</h1>

      <p className={styles.pageIntro}>
        Nội dung soạn sẵn để chèn khi nhắn tin cho khách, và tin nhắn tự động nhắc ngày nhận phòng.
        Tin nhắn tự động được ghi vào hồ sơ đặt phòng trong KAS — hệ thống chưa có kênh gửi tới
        khách.
      </p>

      <nav className={styles.tabs} aria-label="Khu vực tin nhắn">
        <Link href="/partner/messages" className={styles.tab}>
          Hộp thư
        </Link>
        <Link href="/partner/messages/templates" className={styles.tab} data-active>
          Tin nhắn mẫu
        </Link>
      </nav>

      {shelf.status === 'error' ? (
        <ErrorState error={shelf.error} />
      ) : (
        <TemplateManager
          templates={shelf.templates}
          variables={shelf.variables}
          properties={properties}
          copy={TEMPLATE_COPY}
        />
      )}

      <Card title="Nhật ký tin nhắn tự động">
        {log.status === 'error' ? (
          <ErrorState error={log.error} />
        ) : (
          <AutomationLog entries={log.entries} copy={AUTOMATION_LOG_COPY} />
        )}
      </Card>
    </div>
  );
}
