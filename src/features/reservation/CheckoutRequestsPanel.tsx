import Link from 'next/link';
import { cookies } from 'next/headers';
import { opsReservationsApi, type CheckoutRequest } from '@/lib/api/endpoints/opsReservations';
import styles from './CheckoutRequests.module.css';

/**
 * "Chờ xác nhận trả phòng" (V59): checked-in stays whose guest pressed "Trả phòng" in My KAS,
 * or whose check-out time has passed. SUPER_ADMIN opens each one and confirms the check-out,
 * which is what counts the booking towards the member's tier. Nothing is shown when the list
 * is empty or cannot be read (the reservation list below still works).
 */
export async function CheckoutRequestsPanel() {
  let rows: readonly CheckoutRequest[] = [];
  try {
    rows = await opsReservationsApi.checkoutRequests('vi', (await cookies()).toString());
  } catch {
    return null;
  }
  if (rows.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="checkout-requests">
      <h2 id="checkout-requests">Chờ xác nhận trả phòng <span className={styles.count}>{rows.length}</span></h2>
      <p className={styles.hint}>
        Khách đã bấm “Trả phòng” hoặc đã quá giờ trả phòng. Mở đơn và bấm “Trả phòng” để xác nhận; đơn đặt qua website
        bằng tài khoản hội viên sẽ được tính vào số đơn xét hạng.
      </p>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.reference}>
            <Link href={`/partner/reservations/${encodeURIComponent(row.reference)}`} className={styles.item}>
              <span className={styles.ref}>{row.reference}</span>
              <span>{row.guestName ?? 'Khách'} · {row.propertyName}</span>
              <span className={styles.meta}>Trả phòng {formatDate(row.checkOut)}</span>
              <span className={styles.badge} data-source={row.source}>
                {row.source === 'AUTO' ? 'Tự động (quá giờ trả phòng)' : 'Khách yêu cầu'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
