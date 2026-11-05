import type { PublicPolicy } from '@/lib/domain/availability';
import styles from './Hotel.module.css';

/**
 * The hotel's policies, as a guest sees them — doc 58 §3.1, *"property detail
 * includes … policies"*, from `GET /public/properties/{slug}/policies`.
 *
 * <h2>Why this belongs on the booking page</h2>
 *
 * A guest about to send a booking request is agreeing to terms. Until now the
 * request form asked them to accept policies the page never showed. The backend
 * has served them since 7.5D; nothing rendered them.
 *
 * <h2>Every word is the hotel's own</h2>
 *
 * `summary` and `body` are authored per locale in the Partner console and
 * returned already resolved for the requested locale. Nothing here writes,
 * shortens, reorders by importance or supplies a default for a policy a hotel
 * has not authored — doc 02 §4.2 makes policies **factual fields** where plain
 * disclosure applies, and an invented cancellation rule is the worst possible
 * thing to guess.
 *
 * <h2>The version is shown deliberately</h2>
 *
 * Doc 58 §3.1: the endpoint *"returns `version` for `termsVersion`"*, because a
 * reservation pins the exact version the guest accepted. Showing it is what lets
 * a guest tell which text they agreed to.
 */
export function HotelPolicies({
  policies,
  copy,
}: {
  readonly policies: readonly PublicPolicy[];
  readonly copy: PolicyCopy;
}) {
  if (policies.length === 0) {
    // Not an error, and common mid-onboarding. Saying nothing at all would be
    // worse than saying the hotel has not published them.
    return (
      <section className={styles.policies} aria-labelledby="hotel-policies">
        <h2 id="hotel-policies" className={styles.sectionTitle}>{copy.heading}</h2>
        <p className={styles.policyEmpty}>{copy.none}</p>
      </section>
    );
  }

  return (
    <section className={styles.policies} aria-labelledby="hotel-policies">
      <h2 id="hotel-policies" className={styles.sectionTitle}>{copy.heading}</h2>
      <p className={styles.policyIntro}>{copy.intro}</p>

      <dl className={styles.policyList}>
        {policies.map((policy) => (
          <div key={`${policy.type}-${policy.version}`} className={styles.policy}>
            <dt className={styles.policyType}>
              {copy.types[policy.type] ?? policy.type}
              {/* The backend's own value stays visible: a type added later must
                  not be silently relabelled into something it is not. */}
              <span className={styles.policyVersion}>
                {copy.version} {policy.version}
              </span>
            </dt>
            {/*
              Absent, null and blank all mean "not written", and all three are
              real: the backend runs `default-property-inclusion: non_null`, so a
              policy with no summary arrives with **no summary key at all**.
              Reading `.trim()` off that threw, and it took a genuinely published
              property to find out — every seeded hotel was DRAFT, so this
              component had never rendered live policy data.
            */}
            <dd className={styles.policyBody}>
              {blank(policy.summary) ? null : (
                <p className={styles.policySummary}>{policy.summary}</p>
              )}
              {blank(policy.body) ? null : <p>{policy.body}</p>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export interface PolicyCopy {
  readonly heading: string;
  readonly intro: string;
  readonly none: string;
  readonly version: string;
  /** Label per `PolicyType`. A type with no entry falls back to its own value. */
  readonly types: Readonly<Record<string, string>>;
}

/**
 * Guest copy in both frozen locales, following `requestMessages.ts`.
 *
 * The type labels are the enum's own words translated — `CANCELLATION` is
 * "Cancellation" — not a description of what each policy says. What a policy
 * says is the hotel's to write.
 */
const POLICY_COPY: Readonly<Record<'vi' | 'en', PolicyCopy>> = {
  vi: {
    heading: 'Chính sách khách sạn',
    intro: 'Áp dụng cho kỳ nghỉ của bạn tại khách sạn này.',
    none: 'Khách sạn chưa công bố chính sách nào. Vui lòng liên hệ trực tiếp để biết chi tiết.',
    version: 'Phiên bản',
    types: {
      BOOKING: 'Đặt phòng',
      CANCELLATION: 'Huỷ đặt phòng',
      CHILDREN: 'Trẻ em',
      PETS: 'Thú cưng',
      SMOKING: 'Hút thuốc',
      PAYMENT: 'Thanh toán',
      ACCESSIBILITY: 'Tiếp cận',
      NO_SHOW: 'Không đến nhận phòng',
    },
  },
  en: {
    heading: 'Hotel policies',
    intro: 'These apply to your stay at this hotel.',
    none: 'This hotel has not published its policies yet. Please contact us for details.',
    version: 'Version',
    types: {
      BOOKING: 'Booking',
      CANCELLATION: 'Cancellation',
      CHILDREN: 'Children',
      PETS: 'Pets',
      SMOKING: 'Smoking',
      PAYMENT: 'Payment',
      ACCESSIBILITY: 'Accessibility',
      NO_SHOW: 'No-show',
    },
  },
};

export function policyCopy(locale: string): PolicyCopy {
  return locale === 'vi' ? POLICY_COPY.vi : POLICY_COPY.en;
}

/**
 * Absent, null, or whitespace — all three mean "the operator has not written
 * this", and all three arrive in practice.
 *
 * The backend omits null properties from its JSON entirely, so an unwritten
 * summary is a *missing key* rather than an empty string. A guard that only
 * tested for `''` would throw on the shape the API actually sends.
 */
function blank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}
