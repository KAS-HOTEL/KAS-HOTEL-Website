'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './OtpBoxes.module.css';

const LENGTH = 6;

/** Only digits reach the boxes; a pasted "1 2-3 4 5 6" still works. */
function digitsOf(text: string): string {
  return text.replace(/\D/g, '').slice(0, LENGTH);
}

/**
 * Six single-character boxes for a verification code.
 *
 * <h2>One labelled group, not six unlabelled inputs</h2>
 *
 * A `fieldset` with a `legend` gives the group one name, so a screen reader
 * announces "Mã xác thực, ô 1 / 6" rather than six anonymous text boxes.
 *
 * <h2>The behaviour is real; the destination is not</h2>
 *
 * Typing advances, Backspace on an empty box steps back and clears the one
 * before it, arrow keys move, and pasting a six-digit code fills every box from
 * wherever the caret is. All of that is written against the DOM, not against a
 * contract, so none of it is guesswork — and it is the part that will still be
 * correct when a verification endpoint exists.
 *
 * <p>What does not exist is the endpoint. `onComplete` is called when six digits
 * are present so a future caller can submit; the page that renders this today
 * passes nothing and keeps its submit disabled. There is no resend countdown for
 * the same reason: nothing sends a first code, so a timer counting down to a
 * second one would be theatre.
 */
export function OtpBoxes({
  disabled = false,
  onComplete,
}: {
  readonly disabled?: boolean;
  /** Called with the full code once all six boxes are filled. */
  readonly onComplete?: (code: string) => void;
} = {}) {
  const [values, setValues] = useState<string[]>(() => Array<string>(LENGTH).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function focusBox(index: number) {
    const clamped = Math.min(Math.max(index, 0), LENGTH - 1);
    inputs.current[clamped]?.focus();
    inputs.current[clamped]?.select();
  }

  function commit(next: string[]) {
    setValues(next);
    const code = next.join('');
    if (code.length === LENGTH && !next.includes('')) {
      onComplete?.(code);
    }
  }

  function onChange(index: number, raw: string) {
    const digits = digitsOf(raw);
    if (digits === '') {
      // A cleared box is a real edit, not a no-op — Delete must work.
      const next = [...values];
      next[index] = '';
      commit(next);
      return;
    }

    // Typing into a box while it already holds a digit replaces it and moves on;
    // typing several (an autofilled SMS code) spreads across the boxes.
    const next = [...values];
    for (let offset = 0; offset < digits.length && index + offset < LENGTH; offset += 1) {
      next[index + offset] = digits[offset] ?? '';
    }
    commit(next);
    focusBox(index + digits.length);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      if (values[index] === '') {
        // Empty box: step back and clear the one that actually has a digit.
        event.preventDefault();
        const next = [...values];
        next[index - 1] = '';
        commit(next);
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = digitsOf(event.clipboardData.getData('text'));
    if (digits === '') {
      return;
    }
    // The browser would otherwise drop all six characters into one box.
    event.preventDefault();
    const next = [...values];
    for (let offset = 0; offset < digits.length && index + offset < LENGTH; offset += 1) {
      next[index + offset] = digits[offset] ?? '';
    }
    commit(next);
    focusBox(index + digits.length);
  }

  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.legend}>Mã xác thực</legend>
      <div className={styles.boxes}>
        {values.map((value, index) => (
          <input
            // The boxes are a fixed positional set; there is no id to key on
            // and reordering is not a thing that happens.
            key={index}
            ref={(element) => {
              inputs.current[index] = element;
            }}
            className={styles.box}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={LENGTH}
            aria-label={`Ô ${index + 1} trong 6`}
            value={value}
            onChange={(event) => onChange(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={(event) => onPaste(index, event)}
          />
        ))}
      </div>
    </fieldset>
  );
}
