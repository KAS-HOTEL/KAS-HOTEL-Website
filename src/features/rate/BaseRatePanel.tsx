'use client';

import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { ratesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  baseRateAmount,
  baseRateLabel,
  baseRateProblem,
  formatMoney,
  type BaseRateView,
} from '@/lib/domain/rate';
import { roomTypeName, type RoomTypeView } from '@/lib/domain/roomType';
import { Badge, Button, Card, ConfirmDialog, Input } from '@/ui/primitives';
import styles from './Rate.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * Base rates — doc 56 §3's **Layer 0**, per room type.
 *
 * <h2>A base rate is not a rate rule</h2>
 *
 * A rule is a conditional override: it carries dates, a priority and a
 * specificity, and it wins only where it applies. A base rate is the **fallback**
 * — what a night costs when no rule applies at all. Doc 56 §3.1 ends its
 * specificity ladder at "base", below every rule. The two are different layers,
 * and this panel is deliberately separate from the rules panel so they cannot be
 * mistaken for each other.
 *
 * <h2>One room type per request</h2>
 *
 * `PUT /rates/base/{roomTypeId}` takes one room type. There is **no bulk
 * base-rate operation on the contract**, so each row saves on its own; looping the
 * endpoint behind a single "save all" button would be simulating a workflow the
 * backend does not define (OQ-150). Every row also carries its own
 * `room_type.version`, so two operators editing two rooms never collide, and two
 * editing the same room get a conflict rather than a lost update.
 *
 * <h2>Clearing is not zeroing</h2>
 *
 * Emptying the field **clears** the base rate, returning the room type to having
 * no price at all — which `RateResolver` treats as not sellable rather than free.
 * Setting `0` is a different, deliberate act that the schema permits. Clearing is
 * confirmed, because it silently un-prices every date no rule covers.
 *
 * <h2>Nothing is computed here</h2>
 *
 * No price is suggested, defaulted or derived. Doc 56 §9 keeps base rates (config
 * B6) OPEN; this screen supplies the mechanism, never the number.
 */
export function BaseRatePanel({
  baseRates,
  roomTypes,
  onChanged,
}: {
  readonly baseRates: readonly BaseRateView[];
  readonly roomTypes: readonly RoomTypeView[];
  readonly onChanged: () => Promise<void> | void;
}) {
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<BaseRateView | null>(null);

  const nameOf = (rate: BaseRateView): string => {
    const room = roomTypes.find((candidate) => candidate.id === rate.roomTypeId);
    return room === undefined ? rate.roomTypeSlug : (roomTypeName(room.translations) ?? room.slug);
  };

  const valueOf = (rate: BaseRateView): string => {
    const draft = drafts[rate.roomTypeId];
    if (draft !== undefined) {
      return draft;
    }
    const amount = baseRateAmount(rate);
    return amount === null ? '' : String(amount);
  };

  async function save(rate: BaseRateView, amountMinor: number | null): Promise<void> {
    setBusyId(rate.roomTypeId);
    setError(null);
    setSavedId(null);
    try {
      // One call, one room type — the contract defines no bulk base-rate write.
      await ratesApi.setBaseRate(rate.roomTypeId, { amountMinor, version: rate.version });
      setDrafts((current) => {
        const next = { ...current };
        delete next[rate.roomTypeId];
        return next;
      });
      setSavedId(rate.roomTypeId);
      // The grid is refetched rather than patched: the backend decides what a
      // date now costs, and a rule may still be beating this number.
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError
        ? messageFor(caught)
        : 'Không thể kết nối tới hệ thống. Vui lòng thử lại.');
    } finally {
      setBusyId(null);
      setClearing(null);
    }
  }

  return (
    <Card title="Giá cơ bản">
      <p className={styles.editorNote}>
        Giá cơ bản là mức áp dụng khi <strong>không có quy tắc giá nào</strong> khớp với ngày đó. Quy
        tắc giá luôn thắng giá cơ bản trên những ngày mà nó áp dụng.
      </p>

      {error === null ? null : (
        <div className={propertyStyles.formAlert} role="alert">
          <p className={propertyStyles.formAlertText}>{error}</p>
        </div>
      )}

      {/* Announced rather than only coloured — a save that changes money should
          be audible as well as visible. */}
      <p className={styles.srOnlyStatus} role="status" aria-label="Trạng thái giá cơ bản">
        {savedId === null
          ? ''
          : `Đã lưu giá cơ bản cho ${nameOf(
              baseRates.find((rate) => rate.roomTypeId === savedId) ?? baseRates[0]!,
            )}.`}
      </p>

      {baseRates.length === 0 ? (
        <p className={styles.editorNote}>
          Khách sạn này chưa có loại phòng nào, nên chưa có giá cơ bản để đặt.
        </p>
      ) : (
        <ul className={styles.baseList}>
          {baseRates.map((rate) => {
            const name = nameOf(rate);
            const value = valueOf(rate);
            const problem = baseRateProblem(value);
            const busy = busyId === rate.roomTypeId;
            const current = baseRateAmount(rate);
            const dirty = drafts[rate.roomTypeId] !== undefined;

            return (
              <li key={rate.roomTypeId} className={styles.baseRow}>
                <div className={styles.baseCurrent}>
                  <span className={styles.baseName}>{name}</span>
                  {/* Words, not a tint: doc 82 forbids conveying state by colour. */}
                  <Badge tone={current === null ? 'neutral' : 'info'}>{baseRateLabel(rate)}</Badge>
                </div>

                <Input
                  id={`base-rate-${rate.roomTypeId}`}
                  label={`Giá cơ bản — ${name}`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={value}
                  onChange={(event) =>
                    setDrafts((drafts_) => ({ ...drafts_, [rate.roomTypeId]: event.target.value }))
                  }
                  description={`Mỗi đêm, tính bằng đồng (${rate.currency}). Để trống rồi bấm “Xoá giá” nếu muốn bỏ giá cơ bản.`}
                  error={problem ?? undefined}
                />

                <div className={styles.rowActions}>
                  <Button
                    loading={busy}
                    disabled={busy || problem !== null || !dirty || value.trim() === ''}
                    onClick={() => save(rate, Number(value))}
                  >
                    Lưu
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy || current === null}
                    onClick={() => setClearing(rate)}
                  >
                    Xoá giá
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Clearing un-prices every date no rule covers, which is exactly the state
        the calendar renders as "chưa cấu hình giá". It gets a confirmation for
        the same reason a bulk apply does.
      */}
      <ConfirmDialog
        open={clearing !== null}
        title="Xoá giá cơ bản"
        confirmLabel="Xoá giá cơ bản"
        destructive
        busy={busyId !== null}
        onCancel={() => setClearing(null)}
        onConfirm={() => {
          if (clearing !== null) {
            void save(clearing, null);
          }
        }}
      >
        {clearing === null ? null : (
          <div className={styles.editor}>
            <p className={styles.confirmSentence}>
              {nameOf(clearing)} sẽ không còn giá cơ bản.
            </p>
            <p className={styles.editorNote}>
              Những ngày không có quy tắc giá nào áp dụng sẽ trở lại trạng thái “chưa cấu hình giá”
              và không bán được. Đây không phải đặt giá bằng 0 —
              {baseRateAmount(clearing) === null
                ? ''
                : ` giá hiện tại là ${formatMoney(baseRateAmount(clearing) ?? 0, clearing.currency)}.`}
            </p>
          </div>
        )}
      </ConfirmDialog>
    </Card>
  );
}
