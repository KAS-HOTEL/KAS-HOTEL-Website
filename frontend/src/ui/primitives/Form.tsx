import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertIcon, ChevronDownIcon } from '../icons';
import styles from './Form.module.css';

/**
 * Form primitives — one label/description/error contract for every control.
 *
 * Input, Select and Textarea share {@link FormControl} so they cannot drift
 * apart. A form where one field announces its error to a screen reader and
 * another only turns red is worse than one that is consistently plain.
 *
 * The error carries an icon as well as colour, because doc 82 forbids conveying
 * state by colour alone.
 */

export interface FieldMeta {
  readonly id: string;
  readonly label: string;
  /**
   * How "optional" reads for this field's audience.
   *
   * Defaults to the console's Vietnamese, which is every existing caller. The
   * guest surface is bilingual and passes its own, so one shared primitive does
   * not force a single language onto both.
   */
  readonly optionalLabel?: string | undefined;
  readonly description?: string | undefined;
  /** Backend validation message, typically from `ApiError.fieldErrors()`. */
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
}

function descriptionId(id: string): string {
  return `${id}-description`;
}

function errorId(id: string): string {
  return `${id}-error`;
}

/** The `aria-describedby` value, or undefined when the control has nothing to add. */
export function describedByFor(meta: FieldMeta): string | undefined {
  const ids: string[] = [];
  if (meta.description) {
    ids.push(descriptionId(meta.id));
  }
  if (meta.error) {
    ids.push(errorId(meta.id));
  }
  return ids.length > 0 ? ids.join(' ') : undefined;
}

export function FormControl({
  meta,
  children,
}: {
  readonly meta: FieldMeta;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.control}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={meta.id}>
          {meta.label}
          {meta.required ? <span className={styles.required}> *</span> : null}
        </label>
        {meta.required ? null : (
          <span className={styles.optional}>{meta.optionalLabel ?? 'không bắt buộc'}</span>
        )}
      </div>

      {meta.description ? (
        <p className={styles.description} id={descriptionId(meta.id)}>
          {meta.description}
        </p>
      ) : null}

      {children}

      {meta.error ? (
        <span className={styles.message} id={errorId(meta.id)} role="alert">
          <AlertIcon size={14} />
          {meta.error}
        </span>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'> &
  FieldMeta & {
    /**
     * A decorative glyph inside the leading edge of the field.
     *
     * Opt-in, and decoration only: the field already has a visible label, so the
     * icon repeats what the label says and is hidden from assistive technology.
     * It exists because an envelope beside an email field helps a form be
     * recognised at a glance, not because it carries meaning the label does not.
     */
    readonly leadingIcon?: ReactNode;
  };

export function Input({
  id,
  label,
  description,
  error,
  required,
  optionalLabel,
  leadingIcon,
  ...rest
}: InputProps) {
  const meta: FieldMeta = { id, label, description, error, required, optionalLabel };
  const field = (
    <input
      id={id}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedByFor(meta)}
      className={`${styles.field} ${error ? styles.invalid : ''} ${leadingIcon ? styles.withIcon : ''}`}
      {...rest}
    />
  );

  return (
    <FormControl meta={meta}>
      {leadingIcon === undefined ? (
        field
      ) : (
        <span className={styles.fieldWrap}>
          <span className={styles.fieldIcon} aria-hidden="true">
            {leadingIcon}
          </span>
          {field}
        </span>
      )}
    </FormControl>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'required'> &
  FieldMeta;

/** Same validation semantics as {@link Input}. */
export function Textarea({ id, label, description, error, required, optionalLabel, ...rest }: TextareaProps) {
  const meta: FieldMeta = { id, label, description, error, required, optionalLabel };
  return (
    <FormControl meta={meta}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByFor(meta)}
        className={`${styles.field} ${styles.textarea} ${error ? styles.invalid : ''}`}
        {...rest}
      />
    </FormControl>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'required' | 'children'> &
  FieldMeta & {
    readonly options: readonly SelectOption[];
    /** Rendered as a disabled first option when nothing is selected. */
    readonly placeholder?: string;
    readonly loading?: boolean;
  };

/**
 * A native `select`.
 *
 * Native on purpose. A custom listbox must reimplement type-ahead, keyboard
 * navigation, the mobile picker and screen-reader semantics, and usually gets
 * one of them wrong. The platform control is accessible everywhere for free and
 * remains the right default until a requirement genuinely exceeds it.
 */
export function Select({
  id,
  label,
  description,
  error,
  required,
  optionalLabel,
  options,
  placeholder,
  loading,
  disabled,
  ...rest
}: SelectProps) {
  const meta: FieldMeta = { id, label, description, error, required, optionalLabel };
  return (
    <FormControl meta={meta}>
      <div className={styles.selectWrap}>
        <select
          id={id}
          required={required}
          disabled={disabled === true || loading === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByFor(meta)}
          aria-busy={loading === true ? true : undefined}
          className={`${styles.field} ${styles.select} ${error ? styles.invalid : ''}`}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {loading === true ? <span className={styles.busy}>Đang tải…</span> : null}
        <ChevronDownIcon className={styles.selectIcon} size={16} />
      </div>
    </FormControl>
  );
}
