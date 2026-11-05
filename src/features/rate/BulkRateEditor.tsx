'use client';

import { useMemo, useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { ratesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  ALL_OR_NOTHING_NOTE,
  bulkActionLabel,
  bulkConfirmSentence,
  bulkRequestSignature,
  currentRangeLabel,
  formatMoney,
  type BulkRateEffect,
  type BulkRateRequest,
} from '@/lib/domain/rate';
import { roomTypeName, type RoomTypeView } from '@/lib/domain/roomType';
import { Badge, Button, Card, ConfirmDialog, Drawer, Input } from '@/ui/primitives';
import { bulkRateProblem } from './load';
import styles from './Rate.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * The extranet bulk pricing editor — doc 56 §7 "Bulk apply across a range".
 *
 * <h2>Edit → preview → review → confirm → apply</h2>
 *
 * Doc 56 §7 makes the preview **mandatory**, and says why: "Applying a rate
 * across 90 days without seeing the result is how revenue accidents happen."
 * Apply is therefore unreachable until a preview exists, came back clean, and
 * still describes the form as it currently stands — {@link bulkRequestSignature}
 * decides that last part, so editing any field after previewing puts the
 * operator back at the preview step rather than letting a stale confirmation
 * through.
 *
 * <h2>One operation, because the contract has one</h2>
 *
 * `BulkRateRequest` carries a single `amountMinor`: setting an explicit price is
 * the only bulk operation that exists. Percentage and delta adjustments are not
 * offered because the endpoint cannot express them, not because this form chose
 * not to send them — and `adjustment_percent`'s rounding mode is still PROPOSED
 * (OQ-119) in any case.
 *
 * <h2>All or nothing</h2>
 *
 * Exactly one request is issued. There is no loop over dates, no per-room-type
 * retry, and no path that reports success after a partial failure: `bulk-apply`
 * validates everything before it writes anything, inside one transaction, and a
 * refusal leaves every room type untouched.
 *
 * <h2>Nothing is computed here</h2>
 *
 * Every figure on the review and the confirmation comes from the backend's own
 * response. This component does not resolve rates, rank rules, break ties or
 * predict what a rule will win — `RateResolver` owns all of that.
 */
export function BulkRateEditor({
  propertyId,
  propertyName,
  roomTypes,
  from,
  to,
  onClose,
  onApplied,
}: {
  readonly propertyId: string;
  readonly propertyName: string;
  readonly roomTypes: readonly RoomTypeView[];
  readonly from: string;
  readonly to: string;
  readonly onClose: () => void;
  /** Refetch the grid — the backend is authoritative about what was written. */
  readonly onApplied: (effect: BulkRateEffect) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<readonly string[]>(() =>
    roomTypes.map((room) => room.id),
  );
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(to);
  const [amount, setAmount] = useState('');
  const [priority, setPriority] = useState('0');
  const [name, setName] = useState('');

  const [preview, setPreview] = useState<BulkRateEffect | null>(null);
  const [previewedSignature, setPreviewedSignature] = useState<string | null>(null);
  const [applied, setApplied] = useState<BulkRateEffect | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [refusals, setRefusals] = useState<readonly string[]>([]);

  const nameOf = (roomTypeId: string, fallback: string): string => {
    const room = roomTypes.find((candidate) => candidate.id === roomTypeId);
    return room === undefined ? fallback : (roomTypeName(room.translations) ?? room.slug);
  };

  const problems = bulkRateProblem({
    roomTypeIds: selected,
    dateFrom,
    dateTo,
    amount,
    priority,
  });
  const ready = Object.keys(problems).length === 0;

  const request = useMemo<BulkRateRequest>(() => {
    const base = {
      propertyId,
      roomTypeIds: selected,
      dateFrom,
      dateTo,
      amountMinor: amount.trim() === '' ? 0 : Number(amount),
      priority: priority.trim() === '' ? 0 : Number(priority),
    };
    return name.trim() === '' ? base : { ...base, name: name.trim() };
  }, [propertyId, selected, dateFrom, dateTo, amount, priority, name]);

  const signature = bulkRequestSignature(request);
  // A preview describes one exact request. Once the form moves on from it, it
  // stops being a preview of what apply would send.
  const previewIsCurrent = preview !== null && previewedSignature === signature;
  const conflicts = preview === null ? [] : preview.conflicts;
  const canApply = previewIsCurrent && conflicts.length === 0 && !applying;

  function clearErrors(): void {
    setError(null);
    setFieldErrors({});
    setRefusals([]);
  }

  function report(caught: unknown): void {
    if (caught instanceof ApiError) {
      setError(messageFor(caught));
      setFieldErrors(caught.fieldErrors());
      // `bulk-apply` refuses the whole request and explains why in `details[]`.
      // Those reasons are the useful part and are shown verbatim.
      setRefusals(caught.details.map((detail) => detail.message).filter((text) => text !== ''));
    } else {
      setError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      setFieldErrors({});
      setRefusals([]);
    }
  }

  /** Any edit invalidates the applied result too — it described a different request. */
  function edited<T>(set: (value: T) => void): (value: T) => void {
    return (value: T) => {
      set(value);
      setApplied(null);
      clearErrors();
    };
  }

  async function runPreview(): Promise<void> {
    setPreviewing(true);
    clearErrors();
    try {
      const effect = await ratesApi.bulkPreview(request);
      setPreview(effect);
      setPreviewedSignature(signature);
    } catch (caught) {
      setPreview(null);
      setPreviewedSignature(null);
      report(caught);
    } finally {
      setPreviewing(false);
    }
  }

  async function runApply(): Promise<void> {
    setApplying(true);
    clearErrors();
    try {
      // Exactly one call. The response — not the preview — is what actually
      // happened: `bulkApply` re-derives its effect under lock.
      const effect = await ratesApi.bulkApply(request);
      setApplied(effect);
      setConfirming(false);
      // A fresh preview is required before the next apply, so the operator
      // cannot repeat a write by pressing the button twice.
      setPreview(null);
      setPreviewedSignature(null);
      await onApplied(effect);
    } catch (caught) {
      setConfirming(false);
      report(caught);
    } finally {
      setApplying(false);
    }
  }

  const toggle = (roomTypeId: string): void => {
    setApplied(null);
    clearErrors();
    setSelected((current) =>
      current.includes(roomTypeId)
        ? current.filter((id) => id !== roomTypeId)
        : [...current, roomTypeId],
    );
  };

  return (
    <>
      <Drawer open title="Chỉnh giá hàng loạt" onClose={applying ? () => undefined : onClose}>
        <div className={styles.editor}>
          <p className={styles.editorNote}>
            Khách sạn: <strong>{propertyName}</strong>
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

          <fieldset className={styles.fieldset} aria-describedby="bulk-rooms-help">
            <legend className={styles.legendLabel}>Loại phòng</legend>
            <p className={styles.editorNote} id="bulk-rooms-help">
              Giá được đặt cho từng loại phòng đã chọn, trên mọi ngày trong khoảng.
            </p>
            <div className={styles.checkList}>
              {roomTypes.map((room) => {
                const label = roomTypeName(room.translations) ?? room.slug;
                return (
                  <label key={room.id} className={styles.check} htmlFor={`bulk-room-${room.id}`}>
                    <input
                      id={`bulk-room-${room.id}`}
                      type="checkbox"
                      className={styles.checkBox}
                      checked={selected.includes(room.id)}
                      onChange={() => toggle(room.id)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            {problems.roomTypeIds === undefined && fieldErrors['roomTypeIds'] === undefined ? null : (
              <p className={styles.fieldError} role="alert">
                {problems.roomTypeIds ?? fieldErrors['roomTypeIds']}
              </p>
            )}
          </fieldset>

          <div className={styles.fieldRow}>
            <Input
              id="bulk-date-from"
              label="Từ ngày"
              type="date"
              required
              value={dateFrom}
              onChange={(event) => edited(setDateFrom)(event.target.value)}
            />
            <Input
              id="bulk-date-to"
              label="Đến ngày"
              type="date"
              required
              value={dateTo}
              onChange={(event) => edited(setDateTo)(event.target.value)}
              error={problems.dateTo ?? fieldErrors['dateTo']}
            />
          </div>

          {/*
            One operation, stated rather than chosen. `BulkRateRequest` has a
            single `amountMinor` and no operation field at all, so a radio group
            offering "tăng theo %" would be offering a request the endpoint
            cannot express.
          */}
          <div className={styles.operation}>
            <span className={styles.legendLabel}>Cách thay đổi</span>
            <p className={styles.operationValue}>Đặt giá cố định</p>
            <p className={styles.editorNote}>
              Hợp đồng bulk hiện chỉ nhận một mức giá tuyệt đối. Tăng/giảm theo phần trăm hoặc theo
              số tiền chưa có trong hợp đồng và được hoãn lại (OQ-119).
            </p>
          </div>

          <Input
            id="bulk-amount"
            label="Giá mỗi đêm (VND)"
            type="number"
            min={0}
            step={1}
            required
            inputMode="numeric"
            value={amount}
            onChange={(event) => edited(setAmount)(event.target.value)}
            description="Tính bằng đồng. Hệ thống không gợi ý giá — giá cơ bản vẫn là quyết định của chủ sở hữu."
            error={problems.amount ?? fieldErrors['amountMinor']}
          />

          <Input
            id="bulk-priority"
            label="Độ ưu tiên"
            type="number"
            step={1}
            value={priority}
            onChange={(event) => edited(setPriority)(event.target.value)}
            description="Số lớn hơn thắng khi hai quy tắc cùng áp dụng cho một ngày. Hai quy tắc cùng độ ưu tiên và cùng phạm vi là lỗi cấu hình, hệ thống sẽ từ chối."
            error={problems.priority ?? fieldErrors['priority']}
          />

          <Input
            id="bulk-name"
            label="Tên quy tắc"
            value={name}
            onChange={(event) => edited(setName)(event.target.value)}
            description="Tên này hiện trong lịch giá ở ô mà quy tắc thắng. Bỏ trống thì hệ thống tự đặt tên theo khoảng ngày."
          />

          <div className={propertyStyles.formActions}>
            <Button
              variant="secondary"
              loading={previewing}
              disabled={!ready || previewing || applying}
              onClick={runPreview}
            >
              Xem trước thay đổi
            </Button>
            <Button
              loading={applying}
              disabled={!canApply}
              onClick={() => setConfirming(true)}
            >
              Áp dụng
            </Button>
          </div>

          {previewIsCurrent ? null : (
            <p className={styles.editorNote}>
              {preview === null
                ? 'Bắt buộc xem trước rồi mới áp dụng được. Bản xem trước không ghi gì.'
                : 'Biểu mẫu đã thay đổi sau lần xem trước. Hãy xem trước lại trước khi áp dụng.'}
            </p>
          )}

          {previewIsCurrent && preview !== null ? (
            <PreviewPanel effect={preview} nameOf={nameOf} />
          ) : null}

          {applied === null ? null : (
            <Card title="Đã áp dụng">
              <div role="status" aria-label="Kết quả áp dụng">
                <p className={styles.editorNote}>
                  Đã đổi giá {applied.roomTypes.length} loại phòng trong {applied.nights} ngày, tổng
                  cộng {applied.cellsAffected} ô, thành{' '}
                  {formatMoney(applied.amountMinor, applied.currency)}.
                </p>
              </div>
            </Card>
          )}
        </div>
      </Drawer>

      {/*
        A sibling of the drawer, not a child: nesting it inside would put its
        controls inside the drawer's focus trap. `Dialog` gives the topmost
        dialog the keyboard, so Escape dismisses this confirmation without also
        discarding the form behind it.
      */}
      <ConfirmDialog
        open={confirming}
        title="Xác nhận đổi giá"
        confirmLabel="Xác nhận áp dụng"
        busy={applying}
        onCancel={() => setConfirming(false)}
        onConfirm={runApply}
      >
        {preview === null ? null : (
          <div className={styles.editor}>
            <p className={styles.confirmSentence}>{bulkConfirmSentence(preview)}</p>
            <p className={styles.editorNote}>
              Giá mới: <strong>{formatMoney(preview.amountMinor, preview.currency)}</strong> mỗi đêm,
              từ {preview.dateFrom} đến {preview.dateTo}.
            </p>
            <p className={styles.editorNote}>{ALL_OR_NOTHING_NOTE}</p>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

/**
 * What the backend said the edit would do.
 *
 * Per **room type**, because that is the shape the response has: `BulkRateEffect`
 * reports `currentLowest`/`currentHighest` across the whole range and carries no
 * per-date rows. A per-date table would have to invent the missing values, so
 * the current column shows the range the backend actually returned — and a room
 * type with no price there reads "chưa cấu hình giá", never `0`.
 */
function PreviewPanel({
  effect,
  nameOf,
}: {
  readonly effect: BulkRateEffect;
  readonly nameOf: (roomTypeId: string, fallback: string) => string;
}) {
  return (
    <Card title="Xem trước thay đổi">
      <p className={styles.confirmSentence}>{bulkConfirmSentence(effect)}</p>
      <p className={styles.editorNote}>
        {effect.dateFrom} → {effect.dateTo} · {effect.nights} ngày · giá mới{' '}
        {formatMoney(effect.amountMinor, effect.currency)} mỗi đêm.
      </p>

      {effect.conflicts.length === 0 ? null : (
        <div className={propertyStyles.formAlert} role="alert">
          <div>
            <p className={propertyStyles.formAlertText}>
              Không thể áp dụng thay đổi này. {ALL_OR_NOTHING_NOTE}
            </p>
            <ul className={styles.refusalList}>
              {effect.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className={styles.previewScroll} role="region" aria-label="Chi tiết thay đổi" tabIndex={0}>
        <table className={styles.previewTable}>
          <caption className="srOnly">
            Thay đổi giá theo loại phòng, từ {effect.dateFrom} đến {effect.dateTo}
          </caption>
          <thead>
            <tr>
              <th scope="col">Loại phòng</th>
              <th scope="col">Số ngày</th>
              <th scope="col">Giá hiện tại</th>
              <th scope="col">Giá mới</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {effect.roomTypes.map((row) => (
              <tr key={row.roomTypeId}>
                <th scope="row">{nameOf(row.roomTypeId, row.roomTypeSlug)}</th>
                <td>{row.datesAffected}</td>
                <td>{currentRangeLabel(row, effect.currency)}</td>
                <td>{formatMoney(row.newAmountMinor, effect.currency)}</td>
                <td>
                  {/* Words, not a tint: doc 82 forbids state carried by colour. */}
                  <Badge tone={row.action === 'UPDATE' ? 'info' : 'accent'}>
                    {bulkActionLabel(row.action)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.editorNote}>{ALL_OR_NOTHING_NOTE}</p>
    </Card>
  );
}
