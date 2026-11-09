import { AvailabilitySkeleton } from '@/features/hotel/AvailabilityPanel';
import { roomSelectionCopy } from '@/features/hotel/bookingMessages';
import styles from '@/features/hotel/Hotel.module.css';

/**
 * What a guest sees while the hotel page is being built.
 *
 * <h2>When this actually appears</h2>
 *
 * On a **soft navigation** — a guest opening a hotel from the portfolio, with
 * their dates already chosen and carried on the link. That is the journey this
 * step created, and it is the one where a blank pause would be felt: the guest
 * has already searched and is waiting on an answer.
 *
 * It does **not** appear when the search bar itself is submitted, because that
 * is a native `GET` form and therefore a full document request, which the
 * browser's own loading indicator covers. Claiming otherwise would be claiming a
 * loading state that never renders.
 *
 * <h2>Vietnamese, deliberately</h2>
 *
 * A `loading.tsx` renders before `params` resolve, so the locale is not
 * available here. Vietnamese is the primary market and the default the rest of
 * the guest surface falls back to; a moment of it before an English page is a
 * far smaller cost than no loading state at all.
 */
export default function HotelLoading() {
  return (
    <div className={styles.page}>
      <AvailabilitySkeleton label={roomSelectionCopy('vi').loading} />
    </div>
  );
}
