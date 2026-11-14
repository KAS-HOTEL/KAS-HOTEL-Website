# KAS Web — Admin & Customer Experience upgrade (2026-11-12)

Spec: "MASTER PROMPT — KAS WEB ADMIN & CUSTOMER EXPERIENCE IMPROVEMENT" (12/11/2026).
Status: implemented in the working tree of `Kas_Web_Full_backend_updated/Kas_Web_Full` (branch `Website`).
**Not committed, not pushed, not deployed.** Footer and Support are demos awaiting approval.

## A. Implementation summary

| Task | Done | Files |
|---|---|---|
| 04 Booking status vs payment status (P0) | `/api/v1/me/stays` adds `paymentStatus` (NONE/UNPAID/PENDING/PAID/REFUNDED, computed server-side), `paymentDueAt`, `salesStatusReason`. My KAS shows booking and payment status separately; timeline step reads "Đã thanh toán" once paid, "Đã xác nhận" completes only when confirmed. Read-only consistency audit SQL. | `backend/.../reservation/api/MeStayController.java`, `frontend/js/request-view.js`, `frontend/manage-booking.html`, `docs/audit/booking-payment-consistency.sql` |
| 06 Expired requests (P0) | Expired / declined / closed / cancelled → tab "Đã hủy / Không thành công", never Upcoming/In progress; reason from status history (SLA_EXPIRED → "Khách sạn chưa phản hồi…", PAYMENT_DEADLINE → "chưa thanh toán trước hạn"); no cancel/pay actions. Backend expiry jobs already exist (idempotent, status-guarded, history rows). | same as above |
| SePay integrity (P0) | Reviewed, unchanged: IPN dedupe (`sepay_ipn_event.dedupe_key` UNIQUE), order re-verified via SePay API, one VERIFIED payment per booking (V50), `recorded_by` + history for manual confirmations. SePay return (`?ref=&payment=success`) now opens the booking and re-reads status until SePay confirms. | `manage-booking.html` |
| 05 My Bookings redesign (P1) | Tabs Tất cả / Sắp tới / Đang xử lý / Đã hoàn tất / Đã hủy–Không thành công (empty tabs hidden, counts), status pills, payment note with deadline; detail opens in its own drawer with URL `?ref=` (reload / direct link work), only the account's own bookings (from `/me/stays`), Esc / back closes; detail sections: header, progress, stay, guest, price, cancellation, actions (view hotel, contact support, cancel, check-out). | `manage-booking.html`, `js/request-view.js` |
| 01 Cancellation fees (P1) | New screen: header + "Thêm chính sách", overview (total / active / inactive / hotels applied — real data), searchable & filterable table, large modal form in 5 groups, validation (no negatives, % ≤ 100, whole VND), live preview on an editable sample total, confirm before switching off / deleting. API unchanged. | `frontend/src/features/cancellationFee/*` |
| 02 Customer tier (P1) | Tier column + badge (Classic / Gold / Platinum from `membership_tier.code`), account-status filter (new optional `status` query param, validated), tier badge in detail. Existing tier/date filters and pagination kept. | `AdminCustomerController.java`, `CustomerManager.tsx`, `customerDisplay.tsx`, `CustomerDetail.tsx`, `adminTools.ts`, `AdminTools.module.css` |
| 09 Quick Search (P1) | Root cause: the search bar closed Quick Search before the destination toggle ran, so a second press re-opened it. Fixed; date fields toggle on second press; Esc closes the bar's popups. One panel at a time. | `js/search.js`, `hotels.html` |
| 03 Legacy payment account (P2) | Menu entry removed; direct URL shows a "tạm ẩn" notice. Data, API, editor, SePay, webhook, reconciliation untouched. | `navigation.tsx`, `payment-account/page.tsx`, `ManualBookingActions.tsx` |
| 07 Footer demo (P2) | `/design-preview/footer-v1` (noindex): desktop/mobile toggle, kept / removed / to-confirm links with reasons. Production footer untouched. | `design-preview-footer-v1.html`, `server.js` (route) |
| 08 Support demo (P2) | `/design-preview/support-v1` (noindex): hero + FAQ search, quick-help filter, bilingual FAQ (expand/collapse), contact channels, contact-form prototype (validation, honeypot, 30 s throttle — **not sent**), signed-in booking picker (**live**, read-only `/me/stays`). | `design-preview-support-v1.html` |

Database changes: **none** (no migration). API changes: additive only (`/me/stays` fields; `GET /admin/customers?status=`).

## B. Business logic
- **Booking status**: from `stay_status` when set, else `sales_status` (unchanged). Groups: upcoming = WON/CONFIRMED/CHECK_IN_READY/CHECKED_IN; processing = REQUESTED…PAYMENT_PENDING; completed = CHECKED_OUT/COMPLETED; cancelled/unsuccessful = CANCELLED/EXPIRED/DECLINED/ALTERNATIVE_OFFERED/NO_SHOW.
- **Payment status** (server): REFUNDED if a refund amount is recorded; PAID if `payment_verified_at` or a VERIFIED payment exists; PENDING if awaiting payment and the guest reported a transfer; UNPAID if awaiting payment; else NONE.
- **Paid → confirmed**: unchanged — the hotel confirms availability *before* payment, so a verified payment confirms the booking (same transaction).
- **Expired requests**: `SalesRequestExpiryService` (SLA_EXPIRED) and `PaymentDeadlineService` (PAYMENT_DEADLINE) — status-guarded updates, history rows, emails; confirmed/completed stays are never touched.
- **Cancellation fee**: free window by code (member 12:00 check-in day; guest 24 h before); after it, the hotel rule replaces the all-hotels rule; no active rule → Super Admin review, nothing charged automatically; fee computed and stored by the backend on the cancellation request.

## C. Tests
| Suite | Result |
|---|---|
| Backend unit (`mvn test`) | 271 / 271 pass (new `MeStayPaymentStatusTest`) |
| Backend IT | not run locally (needs the seeded `kas_web_test`); new: `AdminOperationsIT.customerListFiltersByAccountStatusAsShown` — runs in CI |
| Frontend vitest | 1322 / 1322 pass (new `cancellationFee.test.tsx`, tier/status test, nav test) |
| `tsc --noEmit` / eslint / `next build` | pass / 0 errors / pass |
| Browser checks (Chrome, 1366 & 390 px, mocked API) | My KAS pills, tabs, timeline, expired note, drawer open/Esc, deep link + reload, foreign reference refused; Quick Search toggle/switch/Esc/outside; demos load without errors |
| Audit SQL | validated against the migrated schema |

## D. Demo links (after deploy to webdemo / local `node server.js`)
- `/design-preview/footer-v1`
- `/design-preview/support-v1`

## E. Remaining issues / approvals needed
1. **Cancellation policy is not snapshotted at booking**: the fee is taken from the rule active when the guest cancels. Freezing it at booking needs a migration (approval).
2. Cancellation rules have no name / description / time milestones columns; the UI names rules by scope and shows the fixed windows read-only.
3. Customer detail: upgrade history, booking list, stays and booking totals not added (no reliable aggregate API yet).
4. Guest payment page still offers manual transfer if a static QR is stored in the (now hidden) payment account — clear it in DB or keep, decide.
5. Support contact form needs a backend endpoint (storage, email, rate limit) before going live; newsletter has no backend at all.
6. Social URLs (Instagram/Facebook/TikTok) need verified links.
7. Run `docs/audit/booking-payment-consistency.sql` on webdemo/production and review sections A–G before any data repair.
8. On mobile the date picker overlays its own field, so closing is by outside tap / Esc / selecting a date.
