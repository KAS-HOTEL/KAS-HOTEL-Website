'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives';
import { PasswordField } from './PasswordField';
import { PasswordRules, passwordSatisfiesRules } from './PasswordRules';
import styles from './RegisterForm.module.css';

/**
 * Choosing a new password.
 *
 * <h2>The form works; the endpoint does not exist</h2>
 *
 * Everything a reader touches is live: the rules tick as they type, the
 * confirmation reports a mismatch on the field that has it, and the button
 * enables only when both would pass. That is the half worth writing now, and it
 * follows {@link PasswordRules}, so it will still be correct when a reset
 * endpoint exists.
 *
 * <p>What is inert is the submit. There is no password-reset endpoint and no
 * email transport, so the button stays disabled however valid the input is —
 * see the notice the page renders beneath it. A button that appeared to change a
 * password and changed nothing is the failure worth avoiding.
 *
 * <p>No token is read from the URL either: no endpoint issues such a link and
 * nothing validates one, so inventing token semantics would be guessing at a
 * contract.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  // Only once something has been typed: telling someone their confirmation does
  // not match before they have finished typing it is noise.
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const ready = passwordSatisfiesRules(password) && confirmation === password;

  return (
    <div className={styles.fields}>
      {/* The shared field, so these carry the same lock glyph and the same
          show/hide control as the sign-in form — one password affordance across
          the product rather than two. */}
      <PasswordField
        id="new-password"
        label="Mật khẩu mới"
        autoComplete="new-password"
        maxLength={512}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <PasswordRules password={password} />

      <PasswordField
        id="confirm-password"
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        maxLength={512}
        required
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        error={mismatch ? 'Mật khẩu xác nhận không khớp.' : undefined}
      />

      {/*
        Disabled unconditionally, not merely until the form is valid. `ready` is
        computed and shown through the rules and the mismatch message so the
        reader can see they have satisfied everything — and then be told plainly,
        below, that the channel itself is missing.
      */}
      <Button type="submit" disabled title={ready ? undefined : 'Chưa đủ điều kiện'}>
        Đặt lại mật khẩu
      </Button>
    </div>
  );
}
