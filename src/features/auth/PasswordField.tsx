'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon, LockIcon } from '@/ui/icons';
import { FormControl, describedByFor, type FieldMeta } from '@/ui/primitives';
import styles from './PasswordField.module.css';

/**
 * A password input with a visibility toggle.
 *
 * <h2>Why it is not the shared `Input`</h2>
 *
 * {@link FormControl} owns the label/description/error contract and is reused
 * here unchanged, so this field is indistinguishable from every other one in
 * layout, spacing and error semantics. What it adds is a control *inside* the
 * field, which `Input` has no slot for — adding one there would put a password
 * concern into every text box in the product.
 *
 * <h2>The toggle is a real button</h2>
 *
 * Not an icon with a click handler: it is keyboard reachable, it is excluded
 * from the tab order of nothing, and its accessible name changes with the state
 * — doc 82 forbids conveying state by shape alone, so "hiện mật khẩu" becomes
 * "ẩn mật khẩu" rather than only the glyph changing.
 *
 * <p>It is `type="button"` so pressing Enter in the field submits the form
 * instead of toggling visibility.
 *
 * <h2>What it never does</h2>
 *
 * Nothing is stored, logged or echoed anywhere. The value lives in the caller's
 * state for exactly as long as the request takes.
 */
type PasswordFieldProps =
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required' | 'type'> & FieldMeta;

export function PasswordField({
  id,
  label,
  description,
  error,
  required,
  optionalLabel,
  ...rest
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const meta: FieldMeta = { id, label, description, error, required, optionalLabel };
  const hintId = useId();

  return (
    <FormControl meta={meta}>
      <div className={styles.wrap}>
        {/* Decoration, matching the mail glyph on the email field above. The
            visible label already names this control. */}
        <span className={styles.leadIcon} aria-hidden="true">
          <LockIcon size={18} />
        </span>
        <input
          id={id}
          required={required}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={[describedByFor(meta), hintId].filter(Boolean).join(' ') || undefined}
          className={`${styles.field} ${styles.withIcon} ${error ? styles.invalid : ''}`}
          {...rest}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-controls={id}
        >
          {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>
      {/*
        Announced with the field rather than shown: a sighted user sees the icon
        change, and a screen-reader user needs the state in words.
      */}
      <span id={hintId} className={styles.srOnly}>
        {visible ? 'Mật khẩu đang hiển thị.' : 'Mật khẩu đang được ẩn.'}
      </span>
    </FormControl>
  );
}
