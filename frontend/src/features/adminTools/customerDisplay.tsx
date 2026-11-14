import type { Customer } from '@/lib/domain/adminTools';
import styles from './AdminTools.module.css';

export const ACCOUNT_STATUS_LABEL: Readonly<Record<string, string>> = {
  ACTIVE: 'Đang hoạt động',
  UNVERIFIED: 'Chưa xác thực email',
  SUSPENDED: 'Tạm khóa',
  DISABLED: 'Đã vô hiệu hóa',
  NO_ACCOUNT: 'Khách chưa có tài khoản',
};

export function accountStatusTone(status: string | null | undefined): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') {
    return 'success';
  }
  return status === 'UNVERIFIED' || status === 'SUSPENDED' ? 'warning' : 'neutral';
}

/** Tier names as the membership policy stores them (membership_tier.code). */
export const TIER_LABEL: Readonly<Record<string, string>> = { CLASSIC: 'Classic', GOLD: 'Gold', PLATINUM: 'Platinum' };

/** The member's tier as a badge; customers without a membership read "Chưa có hạng". */
export function TierBadge({ tier }: { readonly tier: string | null | undefined }) {
  if (!tier) return <span className={styles.tierNone}>Chưa có hạng</span>;
  const key = tier.toUpperCase();
  return <span className={`${styles.tierBadge} ${styles[`tier${key.charAt(0)}${key.slice(1).toLowerCase()}`] ?? ''}`}>{TIER_LABEL[key] ?? tier}</span>;
}

/** dd/MM/yyyy in KAS business time. */
export function formatRegistered(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(at);
}

/** The customer's photo, or their initial when there is none. */
export function CustomerAvatar({ customer, size = 36 }: { readonly customer: Customer; readonly size?: number }) {
  const initial = (customer.fullName || customer.email || '?').trim().charAt(0).toUpperCase();
  return customer.avatarUrl ? (
    // A same-origin API image behind the session cookie; next/image would add nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.avatar} src={customer.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className={styles.avatarFallback} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {initial}
    </span>
  );
}
