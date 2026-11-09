'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminError } from '@/features/adminTools/useAdminList';
import { ApiError } from '@/lib/api/errors';
import { specialRatesApi } from '@/lib/api/endpoints/specialRates';
import {
  SPECIAL_RATE_KINDS,
  SPECIAL_RATE_KIND_LABEL,
  isSpecialRateKind,
  type SpecialRateKind,
  type SpecialRateRequest,
  type SpecialRateView,
} from '@/lib/domain/specialRate';
import { ConfirmDialog, useToast } from '@/ui/primitives';
import { DOW_SHORT, WEEK_ORDER, dmy, formatVnd, parseVnd, weekdaySubset } from './pricing';
import type { PricingRoom } from './PricingWorkspace';
import styles from './Pricing.module.css';

interface FormState {
  readonly id: string | null;
  readonly kind: SpecialRateKind;
  readonly name: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  /** null = every day. */
  readonly days: readonly number[] | null;
  readonly prices: Readonly<Record<string, string>>;
}

const PLACEHOLDER: Record<SpecialRateKind, string> = {
  HOLIDAY: 'Ví dụ: Lễ 30/4 – 1/5',
  SEASON: 'Ví dụ: Mùa cao điểm hè',
  WEEKLY: 'Ví dụ: Cuối tuần',
  OTHER: 'Ví dụ: Sự kiện thành phố',
};

/** Checks the form before it is sent; the backend checks the same rules again. */
export function specialRateProblem(form: FormState): string | null {
  if (form.name.trim() === '') return 'Nhập tên quy tắc.';
  if (form.kind === 'WEEKLY') {
    if (form.days !== null && form.days.length === 0) return 'Chọn ít nhất một thứ trong tuần.';
  } else if (!form.dateFrom || !form.dateTo) {
    return 'Chọn khoảng ngày.';
  } else if (form.dateTo < form.dateFrom) {
    return 'Ngày kết thúc đang trước ngày bắt đầu.';
  }
  if (!Object.values(form.prices).some((value) => parseVnd(value) !== null)) {
    return 'Nhập giá cho ít nhất một hạng phòng.';
  }
  return null;
}

export function toRequest(form: FormState): SpecialRateRequest {
  const weekly = form.kind === 'WEEKLY';
  return {
    kind: form.kind,
    name: form.name.trim(),
    dateFrom: weekly ? null : form.dateFrom || null,
    dateTo: weekly ? null : form.dateTo || null,
    // A weekly rule on "every day" would be a flat price; it still needs explicit days.
    daysOfWeek: form.days === null ? (weekly ? [0, 1, 2, 3, 4, 5, 6] : null) : [...form.days],
    prices: Object.entries(form.prices)
      .map(([roomTypeId, value]) => ({ roomTypeId, priceMinor: parseVnd(value) }))
      .filter((price): price is { roomTypeId: string; priceMinor: number } => price.priceMinor !== null),
  };
}

/**
 * "Quy tắc đặc biệt": holidays, seasons and weekday patterns with a fixed price per room type,
 * grouped by kind, each editable, switchable and removable.
 */
export function SpecialRatesPanel({ propertyId, rooms, baseByRoom, specialRates }: {
  readonly propertyId: string;
  readonly rooms: readonly PricingRoom[];
  readonly baseByRoom: ReadonlyMap<string, number | null>;
  readonly specialRates: readonly SpecialRateView[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<SpecialRateView | null>(null);

  function open(rate: SpecialRateView | null) {
    setError(null);
    setForm(rate === null
      ? { id: null, kind: 'HOLIDAY', name: '', dateFrom: '', dateTo: '', days: null, prices: {} }
      : {
        id: rate.id,
        kind: isSpecialRateKind(rate.kind) ? rate.kind : 'OTHER',
        name: rate.name,
        dateFrom: rate.dateFrom ?? '',
        dateTo: rate.dateTo ?? '',
        days: weekdaySubset(rate.daysOfWeek),
        prices: Object.fromEntries(rate.prices.map((price) => [price.roomTypeId, formatVnd(price.priceMinor)])),
      });
  }

  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await work();
      show('success', success);
      router.refresh();
      return true;
    } catch (caught) {
      const message = caught instanceof ApiError && caught.status === 409
        ? 'Trùng với một quy tắc khác cùng loại và cùng ngày. Hãy đổi ngày hoặc tắt quy tắc kia.'
        : adminError(caught);
      setError(message);
      show('error', message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form) return;
    const problem = specialRateProblem(form);
    if (problem) { setError(problem); return; }
    const body = toRequest(form);
    const ok = await act(
      () => (form.id ? specialRatesApi.update(form.id, body) : specialRatesApi.create(propertyId, body)),
      `Đã lưu quy tắc “${body.name}”.`,
    );
    if (ok) setForm(null);
  }

  const groups = SPECIAL_RATE_KINDS
    .map((kind) => [kind, specialRates.filter((rate) => (isSpecialRateKind(rate.kind) ? rate.kind : 'OTHER') === kind)] as const)
    .filter(([, list]) => list.length > 0);

  return (
    <section className={styles.panel} aria-labelledby="special-rates">
      <h2 id="special-rates">Quy tắc đặc biệt</h2>
      <p>
        Giá riêng cho ngày lễ, mùa du lịch hoặc theo thứ trong tuần, đặt cố định cho từng hạng phòng.
        Khi trùng ngày: ngày lễ được ưu tiên hơn mùa du lịch, mùa du lịch hơn quy tắc theo thứ.
      </p>

      {groups.length === 0 ? <p className={styles.hint}>Chưa có quy tắc đặc biệt.</p> : groups.map(([kind, list]) => (
        <div key={kind}>
          <div className={styles.groupTitle}>{SPECIAL_RATE_KIND_LABEL[kind]}</div>
          <div className={styles.list}>
            {list.map((rate) => (
              <div key={rate.id} className={styles.item}>
                <span>
                  <strong>{rate.name}</strong>
                  <span className={styles.tags}>
                    <span>{rate.dateFrom ? `${dmy(rate.dateFrom)} – ${dmy(rate.dateTo ?? rate.dateFrom)}` : 'Quanh năm'}</span>
                    <span>{weekdaySubset(rate.daysOfWeek)
                      ? WEEK_ORDER.filter((d) => rate.daysOfWeek?.includes(d)).map((d) => DOW_SHORT[d]).join(', ')
                      : 'Mọi ngày'}</span>
                    <span>{rate.prices.length}/{rooms.length} hạng phòng</span>
                    {rate.active ? null : <span>Đang tắt</span>}
                  </span>
                </span>
                <span className={styles.actions}>
                  <button type="button" className={styles.btn} disabled={busy} onClick={() => open(rate)}>Sửa</button>
                  <button type="button" className={styles.btn} disabled={busy}
                    onClick={() => void act(() => specialRatesApi.setActive(rate.id, !rate.active),
                      `${rate.active ? 'Đã tắt' : 'Đã bật'} “${rate.name}”.`)}>
                    {rate.active ? 'Tắt' : 'Bật'}
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy}
                    onClick={() => setRemoving(rate)}>Xoá</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {form === null ? (
        <button type="button" className={styles.btn} style={{ marginTop: 12 }} onClick={() => open(null)}>
          + Thêm quy tắc đặc biệt
        </button>
      ) : (
        <div className={styles.form} role="group" aria-label={form.id ? 'Sửa quy tắc đặc biệt' : 'Thêm quy tắc đặc biệt'}>
          <div className={styles.field}>
            Loại
            <div className={styles.chips}>
              {SPECIAL_RATE_KINDS.map((kind) => (
                <button key={kind} type="button" aria-pressed={form.kind === kind}
                  onClick={() => setForm({ ...form, kind, days: kind === 'WEEKLY' && form.days === null ? [5, 6] : form.days })}>
                  {SPECIAL_RATE_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.field}>
            Tên quy tắc
            <input type="text" value={form.name} maxLength={120} placeholder={PLACEHOLDER[form.kind]}
              onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          {form.kind === 'WEEKLY' ? null : (
            <div className={styles.two}>
              <label className={styles.field}>
                Từ ngày
                <input type="date" value={form.dateFrom} onChange={(event) => setForm({ ...form, dateFrom: event.target.value })} />
              </label>
              <label className={styles.field}>
                Đến ngày
                <input type="date" value={form.dateTo} min={form.dateFrom || undefined}
                  onChange={(event) => setForm({ ...form, dateTo: event.target.value })} />
              </label>
            </div>
          )}
          <div className={styles.field}>
            Áp dụng vào thứ
            <div className={styles.chips}>
              {WEEK_ORDER.map((day) => {
                const on = form.days === null || form.days.includes(day);
                return (
                  <button key={day} type="button" aria-pressed={on}
                    onClick={() => {
                      const current = form.days ?? [0, 1, 2, 3, 4, 5, 6];
                      const next = on ? current.filter((d) => d !== day) : [...current, day];
                      setForm({ ...form, days: weekdaySubset(next) ?? (next.length === 0 ? [] : null) });
                    }}>
                    {DOW_SHORT[day]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.field}>
            Giá mỗi đêm theo hạng phòng
            <span className={styles.hint}>Để trống hạng phòng nào thì hạng đó giữ giá thường.</span>
          </div>
          <div className={styles.priceTable}>
            {rooms.map((room) => {
              const base = baseByRoom.get(room.id) ?? null;
              return (
                <label key={room.id} className={styles.priceRow}>
                  <span>{room.name}</span>
                  <span className={styles.money}>
                    <input type="text" inputMode="numeric" value={form.prices[room.id] ?? ''}
                      placeholder={base === null ? '—' : formatVnd(base)} aria-label={`Giá ${room.name}`}
                      onChange={(event) => {
                        const v = parseVnd(event.target.value);
                        setForm({ ...form, prices: { ...form.prices, [room.id]: v === null ? '' : formatVnd(v) } });
                      }} />
                    <em>đ</em>
                  </span>
                </label>
              );
            })}
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => void save()}>
              Lưu quy tắc
            </button>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => setForm(null)}>Hủy</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Xoá quy tắc “${removing?.name ?? ''}”?`}
        confirmLabel="Xoá quy tắc"
        cancelLabel="Giữ lại"
        destructive
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const rate = removing;
          setRemoving(null);
          if (rate) void act(() => specialRatesApi.archive(rate.id), `Đã xoá quy tắc “${rate.name}”.`);
        }}
      >
        <p>Các đêm của quy tắc này sẽ trở về giá cơ bản (hoặc quy tắc khác nếu có). Giá đã áp trên lịch không đổi.</p>
      </ConfirmDialog>
    </section>
  );
}
