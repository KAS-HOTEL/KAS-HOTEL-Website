# Backend–Frontend integration update

## Quyết định ưu tiên 24/10/2026 — không tồn phòng

Website không lưu/nhận dữ liệu tồn phòng. Admin tự kiểm tra thủ công bên ngoài website. Các mục lịch sử bên dưới về inventory, hold, buffer, sửa tồn, tự động kiểm tra/trừ/hoàn tồn đã bị thay thế; không thực hiện lại. Giữ mô tả phòng, sức chứa, số lượng yêu cầu và giá. Xem `docs/kas/153-owner-decision-no-website-inventory.md` và `KAS_NO_STOCK_CHANGELOG_2026-10-24.md`. Public pricing dùng `/api/v1/public/request-pricing`.


## Frontend versions and current Next.js connection

There are two frontend codebases in this repository. The Next.js application under `frontend/src` is the platform UI; the older HTML/JS pages and their Node server are a separate demo/site. Do not treat the old `/api/catalog` JSON handlers as the integration state of Next.js.

Next.js forwards same-origin `/api/v1/*` requests to Spring through `frontend/next.config.ts`; configure `KAS_API_ORIGIN` (default `http://localhost:8080`). The old integration notes below describe the HTML/JS Node server only.

The current Next.js API client exports auth/session, customer stays and cancellation, property and room authoring, amenities, policies, inventory, rates, guest catalog/quote/request, sales requests, operations reservations, conversations/templates, media, submissions, facilities, landmarks and experiences. The Partner portal already authors signature experiences, and the Backend enforces the existing publish requirement.

The current HTML/JS **Find Your KAS** page also has the four travel intent filters **Family trip**, **Slow traveller**, **Business** and **Longer stay**. Their hotel mappings were copied into `KAS_FRONTEND_CONTENT_BASELINE.json`; they are editorial suggestions, not hotel tiers. The legacy HTML/JS page displays amenity data in `frontend/js/data.js`; the same file is captured as an initial content baseline there.

Still to reconcile or connect in Next.js:

- The four Find Your KAS intents have not been carried into the Next.js screens.
- There is no public portfolio availability-search endpoint; only the defined quote/request path exists.
- Backend customer profile and admin customer routes exist, but customer profile has no corresponding Next.js API module/UI yet. Owner-scoped stays, customer sign-in/registration and the cancellation decision flow are now connected in Next.js under `/{locale}/account`.
- Backend review moderation, vouchers and Trip.com rating routes exist but are not represented in the current Next.js API exports/screens.
- `GET /public/locations` exists; no Next.js locations/map page consumes it yet.
- Media upload URL and completion are implemented in the current backend and a Next.js API wrapper exists, but require working object-storage configuration. Some older comments still claim the endpoint is absent; reconcile those stale comments before treating upload as unavailable.
- Public amenities currently return an empty list until amenity translations and property/room assignments are populated from the agreed frontend baseline.
- Product decision 2026-10-19: anonymous booking remains available; reservations submitted by an authenticated CUSTOMER are linked by `app_user` identity, never by email matching. Backend stores this link and the booking-time membership snapshot. Migration V35 has been applied on the local PostgreSQL database. Customer sign-in/registration and stays/cancellation are wired under `/{locale}/account`; fee quoting is restricted to SUPER_ADMIN through the existing `reservation.cancel` permission, and ADMIN receives no reservation-operations permission.

## API connection

The legacy Node server currently serves its own `/api/catalog` and `/api/admin/*` handlers and has no Spring proxy (`KAS_BACKEND_URL` is not read by `server.js`). The Next.js app uses `KAS_API_ORIGIN` and proxies `/api/v1/*` same-origin so authentication cookies remain inaccessible to browser JavaScript.

The Frontend's existing `/api/catalog` and `/api/admin/*` endpoints are still served by its Node server and currently persist rates/images in JSON files. The Backend has database-backed equivalents; the next Frontend integration pass should switch those calls to the Backend APIs below before removing the legacy Node handlers. Hotel and room identifiers must be mapped using `property.frontend_key` and `room_type.frontend_key`; Backend `branch_code` remains the booking reference code.

| Existing Frontend function | Backend API to use | Notes |
| --- | --- | --- |
| Public catalog | `GET /api/v1/public/properties?locale=vi` plus property detail, room types, gallery, and `GET /api/v1/public/trip-ratings` | Current `/api/catalog` is a composed legacy payload. Frontend will need a mapper. |
| Admin property / room management | `/api/v1/admin/properties`, `/api/v1/admin/properties/{id}/room-types` | Existing database-backed CRUD; uses UUIDs for mutations, not display keys. |
| Admin room rates | `/api/v1/admin/rates/grid`, `/rates/base/{roomTypeId}`, `/rates/day/{roomTypeId}/{date}`, `/rates/bulk-*` | Existing pricing engine is canonical. V33 maps the three Frontend seasons to rate rules. |
| Image URL/upload/gallery | `/api/v1/admin/media`, `/media/upload-url`, `/media/{assetId}/complete`, `/media/{assetId}/links` | Supports the media library and property/room links. CMS site slots are stored in `site_image_slot`; the old image-overrides JSON response still needs a Frontend adapter. |
| Review list and moderation | `/api/v1/admin/reviews`, `/api/v1/admin/reviews/{id}/moderation` | ADMIN may hide/show/delete; deletion is soft and audited. |
| Customer review submission | `POST /api/v1/me/reviews` | Signed-in owner of a completed reservation only; one review per reservation; queued as PENDING. |
| Customer list/profile | `/api/v1/admin/customers`, `/api/v1/admin/customers/{id}`, `/api/v1/me/profile` | SUPER_ADMIN only for the admin view. |
| Voucher management | `GET/POST /api/v1/admin/vouchers`, `PATCH /api/v1/admin/vouchers/{id}/status` | SUPER_ADMIN permission only; one voucher per reservation is enforced in V33. |

## Customer accounts

- `POST /api/v1/public/auth/customer-register` creates a `CUSTOMER` account and signs it in.
- `POST /api/v1/public/auth/login` and `POST /api/v1/public/auth/logout` use Backend CSRF and HttpOnly session cookies.
- `POST /api/v1/public/auth/customer-register` creates a CUSTOMER account, grants its initial membership and signs it in; the Next.js route is `/{locale}/account/register`.
- `GET /api/v1/me/profile` returns the signed-in customer's profile, tier and points.
- `GET /api/v1/admin/customers?q=&tier=&page=&size=` searches the customer list and filters by tier. `GET /api/v1/admin/customers/{customerId}` reads a profile; `PATCH` updates name, phone, country and locale. These routes require `customer.view` / `customer.edit`, held by SUPER_ADMIN.
- `GET /api/v1/admin/reviews` lists submitted reviews; `PATCH /api/v1/admin/reviews/{reviewId}/moderation` accepts `HIDE`, `SHOW` or `DELETE` plus a reason. Review text cannot be edited.
- New direct customer registrations receive Classic membership and an empty points account. Customer consent remains purpose-specific in the existing consent schema; registration does not opt the customer into marketing.

## Customer stays and cancellation

- `GET /api/v1/me/stays?locale=vi` lists reservations linked to the signed-in CUSTOMER account, including the current cancellation request status and any quoted fee. It never links or returns anonymous reservations by email.
- `POST /api/v1/me/stays/{reference}/cancel` immediately cancels a cancellable stay within its free window. The cutoff is property check-in time minus 24 hours for a non-member, or 12:00 Vietnam time on check-in date for an account whose membership was active when the reservation was placed. On-time cancellation has no fee.
- Outside the free window, the same request creates `PENDING_HOTEL_FEE`; the reservation remains active. `GET /api/v1/ops/reservations/cancellation-requests` lists requests in the caller's property scope. `POST /api/v1/ops/reservations/cancellation-requests/{reference}/{requestId}/fee` records the amount in minor currency units and an optional note. This operations queue and quote route require `reservation.cancel`, currently granted only to SUPER_ADMIN; ADMIN cannot quote fees.
- After a quote, the customer calls `POST /api/v1/me/stays/{reference}/cancel/decision` with `{ "accept": true }` to cancel and accept the fee, or `{ "accept": false }` to decline while leaving the reservation active. The stays response exposes `cancellationRequestStatus`, `cancellationFeeMinor`, `cancellationFeeCurrency` and `cancellationFeeNote` for the UI.
- These endpoints depend on V35 and are connected to the Next.js customer account screens. Requests after the check-in date are rejected.

## Roles

- `ADMIN`: properties, room types, amenities, content/media, room rates and review moderation (including hide/show/delete).
- `SUPER_ADMIN`: every Backend permission, including operations, customer management, vouchers and integrations.

## Points

Earned points receive an expiry timestamp automatically in Vietnam local time. Points earned in quarter months 1–2 expire at the next quarter boundary; points earned in the last month remain valid through the following quarter. A daily Backend job posts append-only expiry ledger entries and updates wallet balances.

## Trip.com quarterly rating update

`GET /api/v1/public/trip-ratings` feeds the Frontend hotel catalog; Frontend refreshes those scores when loading the live catalog.

`PUT /api/v1/admin/properties/{propertyId}/trip-rating` records a quarterly snapshot and updates the current rating used by the catalog. The route requires `integration.manage` (SUPER_ADMIN). Request body:

```json
{
  "quarterStart": "2026-10-01",
  "rating": 8.6,
  "reviewCount": 91,
  "sourceUrl": "https://www.trip.com/...",
  "observedOn": "2026-10-15"
}
```

The update is an authenticated manual refresh. Automatic retrieval requires Trip.com partner API credentials and a supported rating feed; none are configured in this project.

## Database

Local database `kas_web_dev` was backed up and Flyway V35 was applied successfully on 2026-10-19; V33 and V34 were already present. The staging database has not been configured or migrated. Apply and verify the required migrations separately in staging through the normal Flyway deployment process before release.
