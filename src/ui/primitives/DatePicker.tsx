'use client';

import { useId } from 'react';
import { describedByFor, FormControl, type FieldMeta } from './Form';
import styles from './DatePicker.module.css';

/**
 * Date and date-range selection.
 *
 * <h2>Native inputs, deliberately</h2>
 *
 * `<input type="date">` brings keyboard entry, locale-aware formatting, the
 * platform's own calendar popover and the mobile date wheel — all of it
 * accessible, all of it free. A hand-rolled calendar has to reimplement every
 * one of those and typically ships without arrow-key navigation or a usable
 * screen-reader story.
 *
 * `min`, `max` and `step` are passed straight through, so a caller can bound a
 * range without this component knowing why.
 *
 * <h2>No business rules live here</h2>
 *
 * It does not know about the 24-month inventory horizon, `MAX_STAY_NIGHTS`,
 * `SAME_DAY_BOOKING_CUTOFF`, or which dates already carry inventory. Those are
 * backend-owned — the horizon is a `system_setting`, and availability comes from
 * the API — so the feature layer supplies `min`/`max` and this renders them.
 * Encoding any of it here would fork a rule that already has one home.
 */

interface DatePickerProps extends Omit<FieldMeta, 'id'> {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** ISO `yyyy-mm-dd`. */
  readonly min?: string;
  readonly max?: string;
  readonly disabled?: boolean;
}

export function DatePicker({
  id,
  label,
  description,
  error,
  required,
  value,
  onChange,
  min,
  max,
  disabled,
}: DatePickerProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const meta: FieldMeta = { id: fieldId, label, description, error, required };

  return (
    <FormControl meta={meta}>
      <input
        id={fieldId}
        type="date"
        className={`${styles.input} ${error ? styles.invalid : ''}`}
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByFor(meta)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormControl>
  );
}

interface DateRangePickerProps {
  readonly legend: string;
  readonly from: string;
  readonly to: string;
  readonly onChange: (range: { from: string; to: string }) => void;
  readonly min?: string;
  readonly max?: string;
  readonly disabled?: boolean;
  readonly error?: string | undefined;
  readonly fromLabel?: string;
  readonly toLabel?: string;
}

/**
 * A start and an end date.
 *
 * The only rule it enforces is the one that is true of every range: the end
 * cannot precede the start, applied by narrowing each input's `min`/`max`. That
 * is arithmetic, not business policy.
 *
 * Whether a range is *permitted* — a maximum stay, a horizon edge, a
 * blocked season — is decided by the backend, and the caller reflects that
 * through `min`, `max` and `error`.
 *
 * Wrapped in a `fieldset`/`legend` so the two inputs are announced as one group
 * rather than as unrelated fields.
 */
export function DateRangePicker({
  legend,
  from,
  to,
  onChange,
  min,
  max,
  disabled,
  error,
  fromLabel = 'Từ ngày',
  toLabel = 'Đến ngày',
}: DateRangePickerProps) {
  return (
    <fieldset className={styles.range}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.rangeInputs}>
        <DatePicker
          label={fromLabel}
          value={from}
          onChange={(next) => onChange({ from: next, to })}
          {...(min === undefined ? {} : { min })}
          {...(to === '' ? (max === undefined ? {} : { max }) : { max: to })}
          {...(disabled === undefined ? {} : { disabled })}
        />
        <DatePicker
          label={toLabel}
          value={to}
          onChange={(next) => onChange({ from, to: next })}
          {...(from === '' ? (min === undefined ? {} : { min }) : { min: from })}
          {...(max === undefined ? {} : { max })}
          {...(disabled === undefined ? {} : { disabled })}
          {...(error === undefined ? {} : { error })}
        />
      </div>
    </fieldset>
  );
}
