-- Booking / payment consistency audit (read-only, 2026-11-12). Changes nothing.
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f booking-payment-consistency.sql
SET search_path = kas;
\echo '== A. Verified payment, but the booking still awaits payment (PAYMENT_PENDING)'
SELECT r.reference, r.sales_status, r.stay_status, p.received_at, p.method, p.recorded_by IS NOT NULL AS by_staff
  FROM reservation r JOIN payment p ON p.reservation_id = r.id AND p.status = 'VERIFIED'
 WHERE r.sales_status = 'PAYMENT_PENDING';
\echo '== B. Confirmed (WON / CONFIRMED) without a verified payment'
SELECT r.reference, r.sales_status, r.stay_status, r.payment_verified_at, r.created_at
  FROM reservation r
 WHERE (r.sales_status = 'WON' OR r.stay_status IN ('CONFIRMED','CHECK_IN_READY','CHECKED_IN','CHECKED_OUT','COMPLETED'))
   AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id AND p.status = 'VERIFIED');
\echo '== C. payment_verified_at set but no VERIFIED payment row (or the reverse)'
SELECT r.reference, r.sales_status, r.payment_verified_at,
       EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id AND p.status = 'VERIFIED') AS has_verified_payment
  FROM reservation r
 WHERE (r.payment_verified_at IS NOT NULL) <> EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id AND p.status = 'VERIFIED');
\echo '== D. SePay reported PAID but the booking was not confirmed (match_status not CONFIRMED)'
SELECT e.received_at, e.order_invoice_number, e.transaction_id, e.amount_minor, e.match_status, r.reference, r.sales_status
  FROM sepay_ipn_event e LEFT JOIN reservation r ON r.id = e.reservation_id
 WHERE (e.order_status IN ('CAPTURED','PAID') OR e.transaction_status = 'APPROVED') AND e.match_status <> 'CONFIRMED'
 ORDER BY e.received_at DESC;
\echo '== E. Expired / closed requests that still hold a verified payment (money to settle)'
SELECT r.reference, r.sales_status, p.amount_minor, p.received_at
  FROM reservation r JOIN payment p ON p.reservation_id = r.id AND p.status = 'VERIFIED'
 WHERE r.sales_status::text IN ('EXPIRED','LOST','DECLINED','ALTERNATIVE_OFFERED') AND r.stay_status IS DISTINCT FROM 'CANCELLED';
\echo '== F. Requests past their response deadline still open (expiry job behind?)'
SELECT r.reference, r.sales_status, r.sla_due_at
  FROM reservation r
 WHERE r.sales_status::text IN ('REQUESTED','ASSIGNED','AVAILABILITY_CHECK') AND r.sla_due_at < now() - interval '10 minutes';
\echo '== G. Awaiting payment past the payment deadline, not reported, not expired'
SELECT r.reference, r.payment_due_at
  FROM reservation r
 WHERE r.sales_status = 'PAYMENT_PENDING' AND r.payment_due_at < now() - interval '10 minutes'
   AND NOT EXISTS (SELECT 1 FROM reservation_email_action_token tk WHERE tk.reservation_id = r.id AND tk.action = 'GUEST_MARK_PAID' AND tk.used_at IS NOT NULL);
\echo '== H. Totals by sales / stay status'
SELECT sales_status, stay_status, count(*) FROM reservation GROUP BY 1, 2 ORDER BY 1, 2;
