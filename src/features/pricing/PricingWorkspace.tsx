'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { adminError } from '@/features/adminTools/useAdminList';
import { PropertyStatus } from '@/features/property/PropertyStatus';
import { specialRatesApi } from '@/lib/api/endpoints/specialRates';
import { addDays } from '@/lib/domain/availability';
import { indexRateCells, type BaseRateView, type RateCell, type RateGridView } from '@/lib/domain/rate';
import type { SpecialRateView } from '@/lib/domain/specialRate';
import { useToast } from '@/ui/primitives';
import { BasePricePanel } from './BasePricePanel';
import {
  DOW_SHORT,
  SOURCE_LABEL,
  SPANS,
  cellKey,
  cellRectangle,
  cellSource,
  dmy,
  explainCell,
  formatVnd,
  isWeekend,
  parseVnd,
  ruleLabel,
  shortVnd,
  splitKey,
  type Span,
} from './pricing';
import { SpecialRatesPanel } from './SpecialRatesPanel';
import styles from './Pricing.module.css';

export interface PricingRoom {
  readonly id: string;
  readonly name: string;
}

/**
 * One hotel's pricing workspace (SUPER_ADMIN). The calendar shows where every night's price
 * comes from; selecting cells sets a calendar price for all of them at once; base prices and
 * special rules sit below. Precedence (the backend's): calendar price → special rule → base.
 */
export function PricingWorkspace(props: {
  readonly propertyId: string;
  readonly name: string;
  readonly lifecycleState: string;
  readonly hotels: readonly { readonly id: string; readonly name: string }[];
  readonly rooms: readonly PricingRoom[];
  readonly today: string;
  readonly from: string;
  readonly span: Span;
  readonly dates: readonly string[];
  readonly grid: RateGridView;
  readonly baseRates: readonly BaseRateView[];
  readonly specialRates: readonly SpecialRateView[];
}) {
  const { propertyId, rooms, dates, grid, baseRates, specialRates, span, from } = props;
  const router = useRouter();
  const { show } = useToast();
  const cells = useMemo(() => indexRateCells(grid.rows), [grid.rows]);
  const baseByRoom = useMemo(
    () => new Map(baseRates.map((rate) => [rate.roomTypeId, rate.amountMinor ?? null])),
    [baseRates],
  );
  const roomIds = useMemo(() => rooms.map((room) => room.id), [rooms]);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const drag = useRef<{ anchor: { roomTypeId: string; date: string }; base: ReadonlySet<string> } | null>(null);

  useEffect(() => {
    const end = () => { drag.current = null; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  function selectTo(target: { roomTypeId: string; date: string }) {
    const current = drag.current;
    if (!current) return;
    const next = new Set(current.base);
    cellRectangle(roomIds, dates, current.anchor, target).forEach((key) => next.add(key));
    setSelected(next);
  }

  const href = (nextFrom: string, nextSpan: number = span) =>
    `/partner/pricing/${propertyId}?from=${nextFrom}&span=${nextSpan}`;
  const to = dates[dates.length - 1] ?? from;

  return (
    <div className={styles.page}>
      <div className={styles.wsHead}>
        <div>
          <div className={styles.crumb}><Link href="/partner/pricing">← Giá phòng</Link></div>
          <div className={styles.hotelPick}>
            <label htmlFor="pricing-hotel" className="srOnly">Khách sạn</label>
            <select id="pricing-hotel" value={propertyId}
              onChange={(event) => router.push(`/partner/pricing/${event.target.value}?from=${from}&span=${span}`)}>
              {props.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
            <PropertyStatus state={props.lifecycleState} />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Link className={styles.btn} href={href(addDays(from, -span))} aria-label={`Lùi ${span} ngày`}>←</Link>
        <span className={styles.range}>{dmy(from)} – {dmy(to)}</span>
        <Link className={styles.btn} href={href(addDays(from, span))} aria-label={`Tới ${span} ngày`}>→</Link>
        <Link className={styles.btn} href={href(props.today)}>Hôm nay</Link>
        <div className={styles.seg} role="group" aria-label="Số ngày hiển thị">
          {SPANS.map((n) => (
            <Link key={n} href={href(from, n)} aria-current={n === span ? 'true' : undefined}>{n} ngày</Link>
          ))}
        </div>
        <span className={styles.grow} />
        <span className={styles.hint}>Kéo để chọn nhiều ô · giữ Shift để chọn thêm</span>
      </div>

      <div className={styles.legend} aria-label="Chú thích màu">
        <span><i style={{ background: 'var(--src-day)' }} />Giá áp trên lịch</span>
        <span><i style={{ background: 'var(--src-rule)' }} />Quy tắc đặc biệt</span>
        <span><i style={{ background: 'var(--src-base)' }} />Giá cơ bản</span>
        <span><i style={{ background: 'var(--src-gap)' }} />Chưa có giá</span>
        <span><i style={{ background: 'var(--weekend)' }} />Cuối tuần</span>
      </div>

      <div className={styles.work}>
        <div className={styles.gridWrap}>
          {rooms.length === 0 ? (
            <p className={styles.hint} style={{ padding: 16 }}>Khách sạn chưa có hạng phòng. Admin cần tạo hạng phòng trước.</p>
          ) : (
            <table className={styles.cal}>
              <caption className="srOnly">Lịch giá {props.name}</caption>
              <thead>
                <tr>
                  <th className={styles.rowHead} scope="col">Hạng phòng</th>
                  {dates.map((date) => {
                    const day = new Date(`${date}T00:00:00Z`);
                    return (
                      <th key={date} scope="col" data-weekend={isWeekend(date) || undefined}
                        data-month-start={day.getUTCDate() === 1 || undefined}>
                        {DOW_SHORT[day.getUTCDay()]} {day.getUTCDate()}
                        <small>Th{day.getUTCMonth() + 1}</small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => {
                  const base = baseByRoom.get(room.id) ?? null;
                  return (
                    <tr key={room.id}>
                      <th className={styles.rowHead} scope="row">
                        {room.name}
                        <small>
                          Cơ bản: {base === null
                            ? <span className={`${styles.badge} ${styles.badgeWarn}`}>chưa đặt</span>
                            : `${formatVnd(base)} đ`}
                        </small>
                      </th>
                      {dates.map((date) => {
                        const key = cellKey(room.id, date);
                        const cell = cells.get(key);
                        const source = cellSource(cell);
                        const amount = cell?.amountMinor ?? null;
                        const label = source === 'rule' ? ruleLabel(cell, specialRates) : SOURCE_LABEL[source];
                        const at = { roomTypeId: room.id, date };
                        return (
                          <td key={date} className={styles.cell} data-source={source}
                            data-weekend={isWeekend(date) || undefined}
                            data-month-start={date.endsWith('-01') || undefined}
                            data-selected={selected.has(key) || undefined}>
                            <button type="button" className={styles.cellBtn}
                              title={`${label}${amount === null ? '' : `: ${formatVnd(amount)} đ`}`}
                              aria-label={`${room.name}, ${dmy(date)}: ${amount === null ? 'chưa có giá' : `${formatVnd(amount)} đồng`}, ${label}`}
                              aria-pressed={selected.has(key)}
                              onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                // Touch captures the pointer to the first cell; release it so
                                // dragging a finger reaches the other cells too.
                                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                  event.currentTarget.releasePointerCapture(event.pointerId);
                                }
                                drag.current = { anchor: at, base: event.shiftKey ? new Set(selected) : new Set() };
                                selectTo(at);
                              }}
                              onPointerEnter={() => selectTo(at)}
                              onClick={(event) => {
                                // Keyboard activation (no pointer): select just this cell.
                                if (event.detail === 0) setSelected(new Set([key]));
                              }}>
                              {shortVnd(amount)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <SidePanel
          selected={selected}
          rooms={rooms}
          cells={cells}
          baseByRoom={baseByRoom}
          specialRates={specialRates}
          onClear={() => setSelected(new Set())}
          onApply={async (amountMinor) => {
            const list = [...selected].map(splitKey);
            try {
              await specialRatesApi.dayPrices(list, amountMinor);
              show('success', amountMinor === null
                ? `Đã bỏ giá đã áp cho ${list.length} ô; các ô trở về theo quy tắc hoặc giá cơ bản.`
                : `Đã áp ${formatVnd(amountMinor)} đ cho ${list.length} ô.`);
              setSelected(new Set());
              router.refresh();
            } catch (caught) {
              show('error', adminError(caught));
            }
          }}
        />
      </div>

      <div className={styles.lower}>
        <BasePricePanel
          key={baseRates.map((rate) => `${rate.roomTypeId}:${rate.amountMinor ?? ''}:${rate.version}`).join(',')}
          rooms={rooms}
          baseRates={baseRates}
        />
        <SpecialRatesPanel propertyId={propertyId} rooms={rooms} baseByRoom={baseByRoom} specialRates={specialRates} />
      </div>
    </div>
  );
}

function SidePanel({ selected, rooms, cells, baseByRoom, specialRates, onClear, onApply }: {
  readonly selected: ReadonlySet<string>;
  readonly rooms: readonly PricingRoom[];
  readonly cells: ReadonlyMap<string, RateCell>;
  readonly baseByRoom: ReadonlyMap<string, number | null>;
  readonly specialRates: readonly SpecialRateView[];
  readonly onClear: () => void;
  readonly onApply: (amountMinor: number | null) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const keys = [...selected];
  const amount = parseVnd(text);

  if (keys.length === 0) {
    return (
      <aside className={styles.side} aria-label="Áp giá hàng loạt">
        <h2>Áp giá hàng loạt</h2>
        <p className={styles.hint}>
          Bấm một ô để xem vì sao ô đó có giá này. Kéo qua nhiều ô (nhiều hạng phòng, nhiều ngày) để áp
          cùng một giá.
        </p>
        <div className={styles.preview}>
          <b>Mỗi đêm lấy giá theo thứ tự</b><br />
          1. Giá áp trên lịch → 2. Quy tắc đặc biệt → 3. Giá cơ bản.
        </div>
      </aside>
    );
  }

  const parts = keys.map(splitKey);
  const roomCount = new Set(parts.map((part) => part.roomTypeId)).size;
  const days = [...new Set(parts.map((part) => part.date))].sort();
  const single = parts.length === 1 ? parts[0] : undefined;
  const singleRoom = single ? rooms.find((room) => room.id === single.roomTypeId) : undefined;
  const why = single
    ? explainCell(cells.get(cellKey(single.roomTypeId, single.date)), single.roomTypeId, single.date,
      baseByRoom.get(single.roomTypeId) ?? null, specialRates)
    : null;
  const hasDayPrice = parts.some((part) => cells.get(cellKey(part.roomTypeId, part.date))?.isDayPrice === true);

  async function run(value: number | null) {
    setBusy(true);
    try {
      await onApply(value);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={styles.side} aria-label="Ô đã chọn">
      <h2>{singleRoom ? singleRoom.name : `${keys.length} ô đã chọn`}</h2>
      <p className={styles.hint}>
        {roomCount} hạng phòng · {days.length} ngày ({dmy(days[0] ?? '')}{days.length > 1 ? ` – ${dmy(days[days.length - 1] ?? '')}` : ''})
      </p>
      {why ? (
        <div className={styles.why}>
          {why.map((line) => (
            <div key={line.label} data-wins={line.wins || undefined}>
              <span>{line.label}</span>
              <span>{line.amount === null ? (line.label === 'Giá cơ bản' ? 'chưa đặt' : 'không có') : `${formatVnd(line.amount)} đ`}</span>
            </div>
          ))}
        </div>
      ) : null}
      <label className={styles.field}>
        Giá mỗi đêm
        <span className={styles.money}>
          <input type="text" inputMode="numeric" placeholder="Ví dụ 1.500.000" value={text}
            onChange={(event) => { const v = parseVnd(event.target.value); setText(v === null ? '' : formatVnd(v)); }} />
          <em>đ</em>
        </span>
      </label>
      <div className={styles.preview} aria-live="polite">
        {amount ? `${keys.length} ô sẽ có giá ${formatVnd(amount)} đ/đêm.` : 'Nhập giá để xem trước.'}
      </div>
      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !amount}
          onClick={() => void run(amount)}>Áp giá</button>
        <button type="button" className={styles.btn} disabled={busy || !hasDayPrice}
          onClick={() => void run(null)}>Bỏ giá đã áp</button>
        <button type="button" className={styles.btn} disabled={busy} onClick={onClear}>Bỏ chọn</button>
      </div>
      <p className={styles.hint}>
        Giá áp trên lịch được ưu tiên hơn quy tắc đặc biệt. “Bỏ giá đã áp” trả các ô về theo quy tắc
        hoặc giá cơ bản.
      </p>
    </aside>
  );
}
