import { CheckIcon } from '@/ui/icons';
import styles from './PasswordRules.module.css';

const MINIMUM_PASSWORD_LENGTH = 8;

/** The rules the backend actually enforces, and how to test one. */
const RULES: readonly {
  readonly id: string;
  readonly label: string;
  readonly met: (password: string) => boolean;
}[] = [
  {
    id: 'length',
    label: `Tối thiểu ${MINIMUM_PASSWORD_LENGTH} ký tự`,
    met: (password) => password.length >= MINIMUM_PASSWORD_LENGTH,
  },
  {
    id: 'mix',
    label: 'Bao gồm chữ hoa, chữ thường và số',
    met: (password) =>
      /[A-ZÀ-Ỹ]/.test(password) && /[a-zà-ỹ]/.test(password) && /[0-9]/.test(password),
  },
];

/**
 * What a new password has to satisfy.
 *
 * <h2>Two rules, because the backend has two</h2>
 *
 * The list is the owner's, taken from the reset design. An unenforced rule shown
 * as a requirement is a lie the form tells and the server contradicts, so the
 * form that shows these stays inert until a server checks them.
 *
 * <h2>Ticks only once there is something to tick</h2>
 *
 * With no `password` prop the rules render as plain guidance — a green check
 * beside "at least 8 characters" on an empty field is a claim about input that
 * does not exist. Once typing starts each rule reports its own state, and the
 * one that fails is the one the registrant can act on.
 */
export function PasswordRules({
  password,
}: {
  /** Omit to render the rules as guidance rather than as status. */
  readonly password?: string;
} = {}) {
  const live = password !== undefined && password.length > 0;

  return (
    <ul className={styles.rules} data-live={live ? 'true' : undefined}>
      {RULES.map((rule) => {
        const met = live && rule.met(password);
        return (
          <li key={rule.id} className={styles.rule} data-met={met ? 'true' : undefined}>
            {live ? (
              <span className={styles.mark} aria-hidden="true">
                {met ? <CheckIcon size={14} /> : null}
              </span>
            ) : null}
            <span>{rule.label}</span>
            {/* The tick is decorative; the state has to reach a screen reader in
                words, and only once there is a state to report. */}
            {live ? <span className={styles.srOnly}>{met ? ' — đạt' : ' — chưa đạt'}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Whether every rule above passes. The step's Continue button asks this. */
export function passwordSatisfiesRules(password: string): boolean {
  return RULES.every((rule) => rule.met(password));
}
