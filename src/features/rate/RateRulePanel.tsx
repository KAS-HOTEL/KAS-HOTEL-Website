'use client';

import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { ratesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  allowedRuleTransitions,
  formatMoney,
  ruleDateRange,
  ruleStatusLabel,
  ruleStatusTone,
  ruleTransitionLabel,
  weekdayLabel,
  type RateRuleView,
  type RuleStatus,
} from '@/lib/domain/rate';
import { roomTypeName, type RoomTypeView } from '@/lib/domain/roomType';
import { Badge, Button, Card, Drawer, EmptyState, Input } from '@/ui/primitives';
import styles from './Rate.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * The rate rules behind the calendar — deliberately compact.
 *
 * <h2>Why it exists at all</h2>
 *
 * A grid cell names only the rule that **won** it, so a rule that is drafted,
 * paused or beaten everywhere is invisible there — and those are exactly the
 * rules an operator looks for when a price is not what they expected. This panel
 * shows `priority` and the backend-derived `specificity`, which are doc 56 §3.1's
 * two ordering keys, so "why did that rule win?" has an answer on screen.
 *
 * It also carries the only way to stop a rule: doc 56 §5.3 archives, never
 * deletes, so a snapshot's `ruleId` always resolves. Without archiving, a bulk
 * edit over the wrong dates would be permanent.
 *
 * <h2>What it deliberately does not do</h2>
 *
 * No ranking, no tie-breaking, no "which rule would win" calculator. It sorts by
 * nothing — the order is the repository's `priority DESC, date_from, name` — and
 * a tie is reported with the backend's own refusal rather than predicted.
 *
 * No from-scratch rule creation: bulk pricing already creates the dated
 * room-type rules the owner's workflow needs, and the extra fields a full editor
 * would open each carry an unresolved question (OQ-119, OQ-120).
 */
export function RateRulePanel({
  rules,
  roomTypes,
  onChanged,
}: {
  readonly rules: readonly RateRuleView[];
  readonly roomTypes: readonly RoomTypeView[];
  readonly onChanged: () => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RateRuleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<readonly string[]>([]);

  function report(caught: unknown): void {
    if (caught instanceof ApiError) {
      // A tie is 422 with `RATE_RULE_TIE` in `details[]`; an illegal transition
      // is 409. Both are shown as the backend worded them — doc 56 §3.1 calls a
      // tie a configuration error, and the operator needs to read which rules.
      setError(messageFor(caught));
      setRefusals(caught.details.map((detail) => detail.message).filter((text) => text !== ''));
    } else {
      setError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      setRefusals([]);
    }
  }

  async function run(ruleId: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusyId(ruleId);
    setError(null);
    setRefusals([]);
    try {
      await action();
      await onChanged();
      return true;
    } catch (caught) {
      report(caught);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const appliesTo = (rule: RateRuleView): string => {
    if (rule.scope === 'PROPERTY') {
      return 'Toàn khách sạn';
    }
    const room = roomTypes.find((candidate) => candidate.id === rule.roomTypeId);
    return room === undefined
      ? 'Loại phòng không có trong danh sách'
      : (roomTypeName(room.translations) ?? room.slug);
  };

  return (
    <Card title="Quy tắc giá">
      <p className={styles.editorNote}>
        Hệ thống chọn quy tắc thắng theo độ ưu tiên rồi đến độ cụ thể. Hai quy tắc bằng nhau ở cả hai
        cột là lỗi cấu hình và hệ thống sẽ từ chối, không tự chọn một cái.
      </p>

      {error === null ? null : (
        <div className={propertyStyles.formAlert} role="alert">
          <div>
            <p className={propertyStyles.formAlertText}>{error}</p>
            {refusals.length === 0 ? null : (
              <ul className={styles.refusalList}>
                {refusals.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState title="Chưa có quy tắc giá nào">
          Dùng “Chỉnh giá hàng loạt” để đặt giá cho một khoảng ngày. Mỗi lần áp dụng sẽ tạo hoặc cập
          nhật một quy tắc cho từng loại phòng.
        </EmptyState>
      ) : (
        <div className={styles.previewScroll} role="region" aria-label="Danh sách quy tắc giá" tabIndex={0}>
          <table className={styles.previewTable}>
            <caption className="srOnly">Quy tắc giá của khách sạn này</caption>
            <thead>
              <tr>
                <th scope="col">Tên</th>
                <th scope="col">Áp dụng cho</th>
                <th scope="col">Khoảng ngày</th>
                <th scope="col">Ngày trong tuần</th>
                <th scope="col">Ưu tiên</th>
                <th scope="col">Độ cụ thể</th>
                <th scope="col">Giá</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const price = rule.priceMinor ?? null;
                const percent = rule.adjustmentPercent ?? null;
                const busy = busyId === rule.id;
                return (
                  <tr key={rule.id}>
                    <th scope="row">{rule.name}</th>
                    <td>{appliesTo(rule)}</td>
                    <td>{ruleDateRange(rule)}</td>
                    <td>{weekdayLabel(rule.daysOfWeek)}</td>
                    <td>{rule.priority}</td>
                    <td>{rule.specificity}</td>
                    <td>
                      {price !== null
                        ? formatMoney(price, rule.currency)
                        : percent !== null
                          ? `${percent}% so với giá cơ bản`
                          : '—'}
                    </td>
                    <td>
                      <Badge tone={ruleStatusTone(rule.status)}>{ruleStatusLabel(rule.status)}</Badge>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        {/*
                          A percentage rule is not repriced here: sending
                          `priceMinor` would convert it to a fixed price, and the
                          rounding this console would then be endorsing is still
                          PROPOSED (OQ-119).
                        */}
                        {price === null && percent !== null ? null : (
                          <Button
                            variant="ghost"
                            disabled={busy || rule.status === 'ARCHIVED'}
                            onClick={() => {
                              setError(null);
                              setRefusals([]);
                              setEditing(rule);
                            }}
                          >
                            Sửa giá
                          </Button>
                        )}
                        {allowedRuleTransitions(rule.status).map((target) => (
                          <Button
                            key={target}
                            variant={target === 'ARCHIVED' ? 'danger' : 'secondary'}
                            loading={busy}
                            disabled={busy}
                            onClick={() =>
                              run(rule.id, () => ratesApi.setRuleStatus(rule.id, target as RuleStatus))
                            }
                          >
                            {ruleTransitionLabel(target)}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing === null ? null : (
        <RuleEditor
          rule={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await run(editing.id, () => ratesApi.updateRule(editing.id, body));
            if (ok) {
              setEditing(null);
            }
          }}
        />
      )}
    </Card>
  );
}

/**
 * Rename and reprice one rule.
 *
 * Commercial fields only, because that is all `PATCH /rate-rules/{id}` accepts:
 * scope, dates and days-of-week are immutable, since changing them would move the
 * rule to a different rung of doc 56 §3.1's specificity ladder and could create a
 * tie the create-time guard already refused.
 *
 * The price is always sent, even when only the name changed —
 * `RateAuthoringService.update` requires exactly one of `priceMinor` and
 * `adjustmentPercent`, so a rename with neither is refused.
 */
function RuleEditor({
  rule,
  busy,
  onClose,
  onSave,
}: {
  readonly rule: RateRuleView;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (body: { name?: string; priceMinor: number }) => void;
}) {
  const [name, setName] = useState(rule.name);
  const [price, setPrice] = useState(rule.priceMinor === null || rule.priceMinor === undefined ? '' : String(rule.priceMinor));

  const amount = Number(price);
  const priceProblem =
    price.trim() === ''
      ? 'Nhập giá cho quy tắc này.'
      : !Number.isInteger(amount) || amount < 0
        ? 'Giá phải là số nguyên không âm, tính bằng đồng.'
        : undefined;

  return (
    <Drawer open title={`Sửa quy tắc — ${rule.name}`} onClose={onClose}>
      <div className={styles.editor}>
        <p className={styles.editorNote}>
          Phạm vi và khoảng ngày của một quy tắc không sửa được. Muốn đổi thì lưu trữ quy tắc này rồi
          tạo lại bằng “Chỉnh giá hàng loạt”.
        </p>

        <Input
          id="rule-name"
          label="Tên quy tắc"
          value={name}
          onChange={(event) => setName(event.target.value)}
          description="Tên này hiện trong lịch giá ở ô mà quy tắc thắng."
        />

        <Input
          id="rule-price"
          label="Giá mỗi đêm (VND)"
          type="number"
          min={0}
          step={1}
          required
          inputMode="numeric"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          error={priceProblem}
        />

        <div className={propertyStyles.formActions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            loading={busy}
            disabled={busy || priceProblem !== undefined}
            onClick={() => {
              const trimmed = name.trim();
              onSave(
                trimmed === '' || trimmed === rule.name
                  ? { priceMinor: amount }
                  : { name: trimmed, priceMinor: amount },
              );
            }}
          >
            Lưu
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
