# KAS — API Test Report (05/11/2026)

## 1. Nguồn và phương pháp

- **Danh sách API lấy từ code**, không suy đoán: quét mọi `*Controller.java` của backend (annotation `@RequestMapping` / `@Get|Post|Put|Patch|DeleteMapping` / `@PreAuthorize`). Kết quả: **163 endpoint** — 116 `/api/v1/admin`, 15 `/api/v1/me`, 32 `/api/v1/public`; GET 65, POST 57, PATCH 23, PUT 9, DELETE 9. Bản đối chiếu với caller frontend (audit 02/11): `docs/audit/KAS-API-MATRIX.csv`.
- Website HTML gọi API qua `js/api.js` (localhost: thẳng `:8080`; nơi khác: cùng origin qua proxy `server.js`); console Next.js gọi qua `lib/api/client.ts` và rewrite `/api/v1/**`.
- Không tạo endpoint giả. Ba lớp kiểm thử:
  1. **IT** — JUnit + MockMvc trên PostgreSQL thật (`mvn verify`: 902 IT, 0 fail).
  2. **Smoke live** — `qa/smoke/kas-smoke.mjs` gọi HTTP thật vào backend đang chạy (89 kiểm tra).
  3. **E2E-API** — kịch bản đặt phòng/huỷ/idempotency/song song trên backend QA cô lập (không gửi email).

## 2. Lớp bảo vệ chung (đã kiểm chứng)

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Mọi endpoint không public có kiểm tra permission | 163/163 (0 thiếu) | quét code + `DenyByDefaultTest`, `UndeclaredEndpointGuardTest` |
| Ẩn danh → `/api/v1/admin/**` | 401 (21 GET + 4 ghi) | SMK-AUTHZ-01/02 |
| Ẩn danh → `/api/v1/me/**` | 401 (5 endpoint) | SMK-AUTH-06 |
| Khách → admin (request hợp lệ) | 403 | SMK-CUS-05 |
| Khách → admin (request thiếu tham số) | **400 trước 403** (QA-003, Low) | SMK-CUS-04 |
| CSRF double-submit trên POST | thiếu token → 403 | SMK-AUTH-01 |
| JSON hỏng | 400 | SMK-AUTH-03 |
| Body 3 MB | 400, không 500 | SMK-AUTH-04 |
| ID không tồn tại / slug lạ | 404 | SMK-API-404, SMK-BKG-03/04 |
| Chuỗi kiểu SQL injection | xử lý như dữ liệu, 404 | SMK-AUTH-05 |
| XSS lưu trữ | lưu dạng text; email escape, console React escape, website loại ký tự HTML | E2E-API + đọc code |
| Lỗi không lộ stack trace | `include-stacktrace: never`, body `{code,message,correlationId}` | mọi kiểm tra (`noLeak`) |
| CORS | origin lạ không được cho phép; danh sách: localhost 3000/3001, kasluxuryhotel.com | SMK-SEC-01 |
| Idempotency đặt phòng | cùng key → cùng mã; khác body → 409; 5 song song → 1 booking | E2E-API |
| Rate limit theo IP | không có (chỉ cooldown OTP/reset theo tài khoản, khoá 5 lần sai) | – (khuyến nghị proxy/WAF) |
| Timeout / DB mất kết nối | health readiness DOWN khi sai DB (KAS-001) | IT `DatabaseConnectivityIT` |

## 3. Độ phủ theo nhóm

Độ phủ được xác định tĩnh: tìm đường dẫn endpoint trong mã test (kể cả URL nối chuỗi). Phép dò có thể **bỏ sót** test gọi URL qua hàm helper, nên con số "chưa thấy test" là cận trên.

| Nhóm | Endpoint | Có IT | Có smoke | Chưa thấy test |
|---|---|---|---|---|
| `/api/v1/admin` | 116 | 68 | 32 | 42 |
| `/api/v1/me` | 15 | 13 | 7 | 2 (`POST /me/reviews`, `POST /me/stays/{ref}/cancel/decision`) |
| `/api/v1/public` | 32 | 21 | 12 | 8 (6 email-action — được audit 02/11 smoke; `site-image-slots`, `trip-ratings` — smoke gọi qua vòng lặp) |
| **Tổng** | **163** | **102** | **51** | **52** |

Endpoint quan trọng phát hiện lỗi trong đợt này: `POST /api/v1/me/stays/{reference}/cancel` — **500** trước khi sửa (QA-001); nay có IT.

## 4. Kết quả kiểm thử chức năng chính

| Endpoint | Kịch bản | Kết quả |
|---|---|---|
| `POST /public/auth/customer-register` | hợp lệ / trùng email / thiếu trường | 201 / 409 / 400 |
| `POST /public/auth/login` | đúng / sai / chưa verify / thiếu CSRF / JSON hỏng | 204 / 401 chung / 403 / 403 / 400 |
| `POST /public/auth/verify-email` | đúng / sai / hết hạn / dùng lại / 5 lần sai | 204 / 400 / 400 / 400 / khoá |
| `POST /public/auth/refresh`, `logout` | phiên hợp lệ; sau logout | 204; profile 401 |
| `GET /public/properties[/{slug}[/room-types\|gallery\|policies\|facilities]]` | 8 khách sạn × 5 | 200 cả 40; slug lạ 404 |
| `POST /public/request-pricing/quote` | hợp lệ; check-out trước/bằng check-in; quá khứ; 0 phòng; 0 người lớn; room/khách sạn lạ; trẻ em | 200; 400×5; 422×3 |
| `POST /public/reservations/requests` | hợp lệ (đăng nhập) / thiếu key / body rỗng / cùng key / khác body / 5 song song / check-out trước / 50 phòng / XSS | 201 / 400 / 400 / cùng mã / 409 / 1 booking / 400 / **201 (QA-004)** / 201 (text) |
| `GET /public/reservations/requests/{ref}/sent` | mã có thật / mã lạ | 200 (không PII, QA-011) / 404 |
| `GET /me/profile`, `/me/console`, `/me/stays` | khách A, B | đúng chủ; NONE; B không thấy booking của A |
| `PUT/DELETE /me/favorites/{slug}` | slug thật / slug lạ | 2xx, danh sách cập nhật / 4xx |
| `POST /me/stays/{ref}/cancel` | chủ booking / lần 2 / khách khác / ẩn danh | **200 CANCELLED (sau sửa)** / 409 / 404 / 401 |
| `GET /api/v1/admin/*` (21) | ẩn danh / khách | 401 / 403 (hoặc 400, QA-003) |

## 5. Hiệu năng API (local, 05/11)

| Endpoint | 30 tuần tự p50 / p95 | 20 song song (tổng thời gian) | Lỗi |
|---|---|---|---|
| `GET /public/properties` | 13 / 18 ms | 33 ms | 0 |
| `GET /public/properties/{slug}` | 16 / 21 ms | 27 ms | 0 |
| `GET /public/properties/{slug}/room-types` | 16 / 20 ms | 32 ms | 0 |
| `GET /public/request-pricing/properties/{slug}` | 29 / 39 ms | 61 ms | 0 |
| `GET /public/trip-intents` | 15 / 17 ms | 15 ms | 0 |

Số đo trên máy local với DB nhỏ (8 khách sạn); chưa đo trên Render.

## 6. Bảng đầy đủ 163 endpoint

"IT tự động" là tên lớp test có gọi endpoint (tối đa 3 tên); "Smoke" là có trong `qa/smoke/kas-smoke.mjs`.

| # | Method | Path | Quyền (permission) | IT tự động | Smoke |
|---|---|---|---|---|---|
| 1 | GET | `/api/v1/admin/amenities` | AMENITY_MANAGE | — | ✓ |
| 2 | GET | `/api/v1/admin/customers` | CUSTOMER_VIEW | AdminOperationsIT, ConsoleRoleIT | ✓ |
| 3 | GET | `/api/v1/admin/customers/{customerId}` | CUSTOMER_VIEW | AdminOperationsIT |  |
| 4 | PATCH | `/api/v1/admin/customers/{customerId}` | CUSTOMER_EDIT | AdminOperationsIT |  |
| 5 | GET | `/api/v1/admin/customers/{customerId}/avatar` | CUSTOMER_VIEW | AdminOperationsIT |  |
| 6 | GET | `/api/v1/admin/media` | MEDIA_UPLOAD | PublicResponseDenylist, AdminOperationsIT, ArchivedMediaIntegrityIT +7 | ✓ |
| 7 | POST | `/api/v1/admin/media` | MEDIA_UPLOAD | PublicResponseDenylist, AdminOperationsIT, ArchivedMediaIntegrityIT +7 | ✓ |
| 8 | GET | `/api/v1/admin/media/{assetId}` | MEDIA_UPLOAD | PublicResponseDenylist, AdminOperationsIT, MediaCoversIT +1 | ✓ |
| 9 | POST | `/api/v1/admin/media/{assetId}/complete` | MEDIA_UPLOAD | — |  |
| 10 | POST | `/api/v1/admin/media/{assetId}/links` | MEDIA_UPLOAD | — |  |
| 11 | DELETE | `/api/v1/admin/media/{assetId}/links/{linkId}` | MEDIA_UPLOAD | — |  |
| 12 | PATCH | `/api/v1/admin/media/{assetId}/links/{linkId}/cover` | MEDIA_UPLOAD | — |  |
| 13 | PATCH | `/api/v1/admin/media/{assetId}/links/{linkId}/order` | MEDIA_UPLOAD | — |  |
| 14 | PATCH | `/api/v1/admin/media/{assetId}/links/{linkId}/status` | MEDIA_PUBLISH | — |  |
| 15 | POST | `/api/v1/admin/media/{assetId}/publish` | MEDIA_PUBLISH | — |  |
| 16 | PATCH | `/api/v1/admin/media/{assetId}/translations` | MEDIA_UPLOAD | — |  |
| 17 | GET | `/api/v1/admin/media/{assetId}/usages` | MEDIA_UPLOAD | — |  |
| 18 | GET | `/api/v1/admin/media/covers` | MEDIA_UPLOAD | — | ✓ |
| 19 | POST | `/api/v1/admin/media/external` | MEDIA_UPLOAD, MEDIA_PUBLISH | AdminOperationsIT |  |
| 20 | POST | `/api/v1/admin/media/upload-url` | MEDIA_UPLOAD | PublicResponseDenylist |  |
| 21 | GET | `/api/v1/admin/message-templates` | SALES_REQUEST_MANAGE | ConsoleRoleIT, MessageAutomationIT, MessageTemplateIT | ✓ |
| 22 | POST | `/api/v1/admin/message-templates` | SALES_REQUEST_MANAGE | ConsoleRoleIT, MessageAutomationIT, MessageTemplateIT | ✓ |
| 23 | DELETE | `/api/v1/admin/message-templates/{id}` | SALES_REQUEST_MANAGE | — | ✓ |
| 24 | PUT | `/api/v1/admin/message-templates/{id}` | SALES_REQUEST_MANAGE | — | ✓ |
| 25 | PUT | `/api/v1/admin/message-templates/{id}/enabled` | SALES_REQUEST_MANAGE | — |  |
| 26 | GET | `/api/v1/admin/message-templates/variables` | SALES_REQUEST_MANAGE | — | ✓ |
| 27 | GET | `/api/v1/admin/ops/conversations` | RESERVATION_VIEW | MessagingIT | ✓ |
| 28 | GET | `/api/v1/admin/ops/message-automation/log` | RESERVATION_VIEW | MessageAutomationIT | ✓ |
| 29 | GET | `/api/v1/admin/ops/reservations` | RESERVATION_VIEW | AdminOperationsIT, ConsoleRoleIT, MessageAutomationIT +3 | ✓ |
| 30 | GET | `/api/v1/admin/ops/reservations/{reference}` | RESERVATION_VIEW | AdminOperationsIT, ConsoleRoleIT, MessageAutomationIT | ✓ |
| 31 | POST | `/api/v1/admin/ops/reservations/{reference}/check-in` | RESERVATION_CHECKIN | AdminOperationsIT |  |
| 32 | POST | `/api/v1/admin/ops/reservations/{reference}/check-out` | RESERVATION_CHECKIN | — |  |
| 33 | GET | `/api/v1/admin/ops/reservations/{reference}/messages` | RESERVATION_VIEW | MessageAutomationIT |  |
| 34 | POST | `/api/v1/admin/ops/reservations/{reference}/messages/preview` | SALES_REQUEST_MANAGE | — |  |
| 35 | POST | `/api/v1/admin/ops/reservations/{reference}/no-show` | RESERVATION_CHECKIN | AdminOperationsIT |  |
| 36 | GET | `/api/v1/admin/ops/reservations/cancellation-requests` | RESERVATION_CANCEL | AdminOperationsIT, ConsoleRoleIT | ✓ |
| 37 | POST | `/api/v1/admin/ops/reservations/cancellation-requests/{reference}/{requestId}/fee` | RESERVATION_CANCEL | AdminOperationsIT |  |
| 38 | GET | `/api/v1/admin/policies` | PROPERTY_MANAGE | AdminOperationsIT, ConsoleRoleIT, PolicyModuleIT | ✓ |
| 39 | POST | `/api/v1/admin/policies` | PROPERTY_MANAGE | AdminOperationsIT, ConsoleRoleIT, PolicyModuleIT | ✓ |
| 40 | GET | `/api/v1/admin/policies/{policyId}` | PROPERTY_MANAGE | — |  |
| 41 | PATCH | `/api/v1/admin/policies/{policyId}/status` | PROPERTY_MANAGE | — |  |
| 42 | PATCH | `/api/v1/admin/policies/{policyId}/translations` | PROPERTY_MANAGE | — |  |
| 43 | GET | `/api/v1/admin/properties` | PROPERTY_MANAGE | AdminOperationsIT, ConsoleRoleIT, ExperienceIT +24 | ✓ |
| 44 | POST | `/api/v1/admin/properties` | PROPERTY_MANAGE | AdminOperationsIT, ConsoleRoleIT, ExperienceIT +24 | ✓ |
| 45 | GET | `/api/v1/admin/properties/{propertyId}` | PROPERTY_MANAGE | AdminOperationsIT, ExperienceIT, FacilityIT +21 |  |
| 46 | PATCH | `/api/v1/admin/properties/{propertyId}` | PROPERTY_MANAGE | AdminOperationsIT, ExperienceIT, FacilityIT +21 |  |
| 47 | PATCH | `/api/v1/admin/properties/{propertyId}/amenities` | PROPERTY_MANAGE | PropertyAmenitiesIT |  |
| 48 | GET | `/api/v1/admin/properties/{propertyId}/completeness` | PROPERTY_MANAGE | ExperienceIT, HeroCoverIntegrityIT, MediaUploadIT +5 |  |
| 49 | GET | `/api/v1/admin/properties/{propertyId}/experiences` | PROPERTY_MANAGE | ExperienceIT |  |
| 50 | POST | `/api/v1/admin/properties/{propertyId}/experiences` | PROPERTY_MANAGE | ExperienceIT |  |
| 51 | DELETE | `/api/v1/admin/properties/{propertyId}/experiences/{experienceId}` | PROPERTY_MANAGE | — |  |
| 52 | PATCH | `/api/v1/admin/properties/{propertyId}/experiences/{experienceId}` | PROPERTY_MANAGE | — |  |
| 53 | GET | `/api/v1/admin/properties/{propertyId}/facilities` | PROPERTY_MANAGE | FacilityIT |  |
| 54 | POST | `/api/v1/admin/properties/{propertyId}/facilities` | PROPERTY_MANAGE | FacilityIT |  |
| 55 | DELETE | `/api/v1/admin/properties/{propertyId}/facilities/{facilityId}` | PROPERTY_MANAGE | — |  |
| 56 | PATCH | `/api/v1/admin/properties/{propertyId}/facilities/{facilityId}` | PROPERTY_MANAGE | — |  |
| 57 | GET | `/api/v1/admin/properties/{propertyId}/landmarks` | PROPERTY_MANAGE | LandmarkIT |  |
| 58 | POST | `/api/v1/admin/properties/{propertyId}/landmarks` | PROPERTY_MANAGE | LandmarkIT |  |
| 59 | DELETE | `/api/v1/admin/properties/{propertyId}/landmarks/{landmarkId}` | PROPERTY_MANAGE | — |  |
| 60 | PATCH | `/api/v1/admin/properties/{propertyId}/landmarks/{landmarkId}` | PROPERTY_MANAGE | — |  |
| 61 | GET | `/api/v1/admin/properties/{propertyId}/payment-profile` | PROPERTY_MANAGE | — |  |
| 62 | PUT | `/api/v1/admin/properties/{propertyId}/payment-profile` | PROPERTY_MANAGE | — |  |
| 63 | GET | `/api/v1/admin/properties/{propertyId}/policies` | PROPERTY_MANAGE | PolicyIT, PolicyModuleIT |  |
| 64 | POST | `/api/v1/admin/properties/{propertyId}/policies` | PROPERTY_MANAGE | PolicyIT, PolicyModuleIT |  |
| 65 | GET | `/api/v1/admin/properties/{propertyId}/policies/{policyId}` | PROPERTY_MANAGE | PolicyModuleIT |  |
| 66 | PATCH | `/api/v1/admin/properties/{propertyId}/policies/{policyId}/status` | PROPERTY_MANAGE | — |  |
| 67 | PATCH | `/api/v1/admin/properties/{propertyId}/policies/{policyId}/translations` | PROPERTY_MANAGE | — |  |
| 68 | POST | `/api/v1/admin/properties/{propertyId}/publish` | PROPERTY_MANAGE | PropertyPublishIT |  |
| 69 | GET | `/api/v1/admin/properties/{propertyId}/room-types` | ROOMTYPE_MANAGE | RoomTypeAuthoringIT, RoomTypeIT, RoomTypeReadIT |  |
| 70 | POST | `/api/v1/admin/properties/{propertyId}/room-types` | ROOMTYPE_MANAGE | RoomTypeAuthoringIT, RoomTypeIT, RoomTypeReadIT |  |
| 71 | GET | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}` | ROOMTYPE_MANAGE | — |  |
| 72 | PATCH | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}` | ROOMTYPE_MANAGE | — |  |
| 73 | PATCH | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}/amenities` | ROOMTYPE_MANAGE | — |  |
| 74 | PATCH | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}/status` | ROOMTYPE_MANAGE | — |  |
| 75 | GET | `/api/v1/admin/properties/{propertyId}/submissions` | PROPERTY_MANAGE | OnboardingWorkflowIT |  |
| 76 | POST | `/api/v1/admin/properties/{propertyId}/submit` | PROPERTY_MANAGE | HeroCoverIntegrityIT, MediaIT, NinthPropertyE2EIT +4 |  |
| 77 | PATCH | `/api/v1/admin/properties/{propertyId}/trip-intents` | PROPERTY_MANAGE | — |  |
| 78 | PUT | `/api/v1/admin/properties/{propertyId}/trip-rating` | INTEGRATION_MANAGE | AdminOperationsIT |  |
| 79 | GET | `/api/v1/admin/property-submissions` | PROPERTY_MANAGE | ConsoleRoleIT, MediaIT, NinthPropertyE2EIT +4 | ✓ |
| 80 | GET | `/api/v1/admin/property-submissions/{submissionId}` | PROPERTY_MANAGE | MediaIT, NinthPropertyE2EIT, OnboardingWorkflowIT +3 |  |
| 81 | POST | `/api/v1/admin/property-submissions/{submissionId}/approve` | PROPERTY_MANAGE | MediaIT, NinthPropertyE2EIT, OnboardingWorkflowIT +3 |  |
| 82 | POST | `/api/v1/admin/property-submissions/{submissionId}/reject` | PROPERTY_MANAGE | OnboardingWorkflowIT |  |
| 83 | POST | `/api/v1/admin/property-submissions/{submissionId}/request-changes` | PROPERTY_MANAGE | OnboardingWorkflowIT |  |
| 84 | GET | `/api/v1/admin/rate-rules` | RATE_VIEW | BaseRateIT, DayPriceIT, RateAuthoringIT | ✓ |
| 85 | POST | `/api/v1/admin/rate-rules` | RATE_MANAGE | BaseRateIT, DayPriceIT, RateAuthoringIT | ✓ |
| 86 | PATCH | `/api/v1/admin/rate-rules/{ruleId}` | RATE_MANAGE | DayPriceIT |  |
| 87 | PATCH | `/api/v1/admin/rate-rules/{ruleId}/status` | RATE_MANAGE | DayPriceIT |  |
| 88 | GET | `/api/v1/admin/rates/base` | RATE_VIEW | BaseRateIT | ✓ |
| 89 | PUT | `/api/v1/admin/rates/base/{roomTypeId}` | RATE_MANAGE | — |  |
| 90 | POST | `/api/v1/admin/rates/bulk-apply` | RATE_MANAGE | — |  |
| 91 | POST | `/api/v1/admin/rates/bulk-preview` | RATE_MANAGE | — |  |
| 92 | DELETE | `/api/v1/admin/rates/day/{roomTypeId}/{date}` | RATE_MANAGE | DayPriceIT, DayPriceReachesGuestIT |  |
| 93 | PUT | `/api/v1/admin/rates/day/{roomTypeId}/{date}` | RATE_MANAGE | DayPriceIT, DayPriceReachesGuestIT |  |
| 94 | GET | `/api/v1/admin/rates/grid` | RATE_VIEW | BaseRateIT, DayPriceIT, RateAuthoringIT +1 | ✓ |
| 95 | GET | `/api/v1/admin/reviews` | REVIEW_MODERATE | AdminOperationsIT, ConsoleRoleIT | ✓ |
| 96 | PATCH | `/api/v1/admin/reviews/{reviewId}/moderation` | REVIEW_MODERATE | AdminOperationsIT |  |
| 97 | GET | `/api/v1/admin/sales/requests` | SALES_REQUEST_VIEW | AdminOperationsIT, BookingEmailLanguageIT, ConsoleRoleIT +10 | ✓ |
| 98 | GET | `/api/v1/admin/sales/requests/{reference}` | SALES_REQUEST_VIEW | BookingEmailLanguageIT | ✓ |
| 99 | POST | `/api/v1/admin/sales/requests/{reference}/approve-payment` | SALES_REQUEST_MANAGE | BookingEmailLanguageIT |  |
| 100 | POST | `/api/v1/admin/sales/requests/{reference}/assign` | SALES_REQUEST_ASSIGN | — |  |
| 101 | POST | `/api/v1/admin/sales/requests/{reference}/availability-check` | SALES_REQUEST_MANAGE | — |  |
| 102 | POST | `/api/v1/admin/sales/requests/{reference}/cancel` | RESERVATION_CANCEL | BookingEmailLanguageIT |  |
| 103 | POST | `/api/v1/admin/sales/requests/{reference}/confirm-payment` | RESERVATION_WIN | BookingEmailLanguageIT |  |
| 104 | POST | `/api/v1/admin/sales/requests/{reference}/contact` | SALES_REQUEST_MANAGE | — |  |
| 105 | POST | `/api/v1/admin/sales/requests/{reference}/decline` | RESERVATION_CANCEL | BookingEmailLanguageIT |  |
| 106 | GET | `/api/v1/admin/sales/requests/{reference}/email-deliveries` | SALES_REQUEST_VIEW | — |  |
| 107 | GET | `/api/v1/admin/sales/requests/{reference}/notes` | SALES_REQUEST_MANAGE | — |  |
| 108 | POST | `/api/v1/admin/sales/requests/{reference}/notes` | SALES_REQUEST_MANAGE | — |  |
| 109 | POST | `/api/v1/admin/sales/requests/{reference}/propose-alternative` | SALES_REQUEST_MANAGE | — |  |
| 110 | POST | `/api/v1/admin/sales/requests/{reference}/win` | RESERVATION_WIN | — |  |
| 111 | GET | `/api/v1/admin/sales/requests/counts` | SALES_REQUEST_VIEW | — | ✓ |
| 112 | GET | `/api/v1/admin/site-image-slots` | CONTENT_MANAGE | AdminOperationsIT, ConsoleRoleIT, SecurityBoundaryTest | ✓ |
| 113 | PATCH | `/api/v1/admin/site-image-slots/{key}` | CONTENT_MANAGE | AdminOperationsIT, SecurityBoundaryTest |  |
| 114 | GET | `/api/v1/admin/vouchers` | VOUCHER_MANAGE | AdminOperationsIT, ConsoleRoleIT | ✓ |
| 115 | POST | `/api/v1/admin/vouchers` | VOUCHER_MANAGE | AdminOperationsIT, ConsoleRoleIT | ✓ |
| 116 | PATCH | `/api/v1/admin/vouchers/{id}/status` | VOUCHER_MANAGE | — |  |
| 117 | GET | `/api/v1/me/console` | authenticated | ConsoleRoleIT | ✓ |
| 118 | GET | `/api/v1/me/favorites` | authenticated | CustomerEmailVerificationIT | ✓ |
| 119 | DELETE | `/api/v1/me/favorites/{slug}` | authenticated | CustomerEmailVerificationIT | ✓ |
| 120 | PUT | `/api/v1/me/favorites/{slug}` | authenticated | CustomerEmailVerificationIT | ✓ |
| 121 | GET | `/api/v1/me/profile` | authenticated | CustomerEmailVerificationIT | ✓ |
| 122 | PUT | `/api/v1/me/profile` | authenticated | CustomerEmailVerificationIT | ✓ |
| 123 | GET | `/api/v1/me/profile/avatar` | authenticated | CustomerEmailVerificationIT |  |
| 124 | PUT | `/api/v1/me/profile/avatar` | authenticated | CustomerEmailVerificationIT |  |
| 125 | POST | `/api/v1/me/reviews` | REVIEW_CREATE | — |  |
| 126 | DELETE | `/api/v1/me/sessions` | authenticated | AuthenticationIT, RbacAndScopeIT |  |
| 127 | GET | `/api/v1/me/sessions` | authenticated | AuthenticationIT, RbacAndScopeIT |  |
| 128 | DELETE | `/api/v1/me/sessions/{sessionId}` | authenticated | RbacAndScopeIT |  |
| 129 | GET | `/api/v1/me/stays` | ME_STAY_VIEW | CustomerEmailVerificationIT | ✓ |
| 130 | POST | `/api/v1/me/stays/{reference}/cancel` | ME_STAY_CANCEL | CustomerEmailVerificationIT |  |
| 131 | POST | `/api/v1/me/stays/{reference}/cancel/decision` | ME_STAY_CANCEL | — |  |
| 132 | GET | `/api/v1/public/amenities` | public | PublicAmenityIT |  |
| 133 | POST | `/api/v1/public/auth/customer-register` | public | BookingEmailLanguageIT, CustomerEmailVerificationIT |  |
| 134 | POST | `/api/v1/public/auth/forgot-password` | public | BookingEmailLanguageIT |  |
| 135 | POST | `/api/v1/public/auth/login` | public | AuthenticationIT, CustomerEmailVerificationIT, SecurityIntegrationTest | ✓ |
| 136 | POST | `/api/v1/public/auth/logout` | authenticated | AuthenticationIT | ✓ |
| 137 | POST | `/api/v1/public/auth/refresh` | public | AuthenticationIT, CustomerEmailVerificationIT | ✓ |
| 138 | POST | `/api/v1/public/auth/resend-verification` | public | CustomerEmailVerificationIT |  |
| 139 | POST | `/api/v1/public/auth/reset-password` | public | BookingEmailLanguageIT |  |
| 140 | POST | `/api/v1/public/auth/verify-email` | public | CustomerEmailVerificationIT |  |
| 141 | GET | `/api/v1/public/locations` | public | PropertyCoordinatesIT, PublicLocationIT |  |
| 142 | GET | `/api/v1/public/properties` | public | AdminOperationsIT, ExperienceIT, FacilityIT +16 | ✓ |
| 143 | GET | `/api/v1/public/properties/{slug}` | public | AdminOperationsIT, ExperienceIT, FacilityIT +13 | ✓ |
| 144 | GET | `/api/v1/public/properties/{slug}/facilities` | public | FacilityIT |  |
| 145 | GET | `/api/v1/public/properties/{slug}/gallery` | public | AdminOperationsIT, GuestRoomSelectionIT, MediaDeliveryKeyIT +3 |  |
| 146 | GET | `/api/v1/public/properties/{slug}/policies` | public | PolicyIT |  |
| 147 | GET | `/api/v1/public/properties/{slug}/room-types` | public | GuestRoomSelectionIT, MediaIT, NinthPropertyE2EIT +2 | ✓ |
| 148 | GET | `/api/v1/public/properties/{slug}/room-types/{roomTypeSlug}/gallery` | public | GuestRoomSelectionIT, MediaIT, PublishPipelineIT |  |
| 149 | GET | `/api/v1/public/request-pricing/properties/{slug}` | public | ManualRequestPricingControllerTest, DayPriceReachesGuestIT, GuestRoomSelectionIT +1 |  |
| 150 | POST | `/api/v1/public/request-pricing/quote` | public | DayPriceReachesGuestIT, QuoteIT | ✓ |
| 151 | GET | `/api/v1/public/reservation-actions/{token}` | public | — | ✓ |
| 152 | POST | `/api/v1/public/reservation-actions/{token}/accept-alternative` | public | — |  |
| 153 | POST | `/api/v1/public/reservation-actions/{token}/approve` | public | — |  |
| 154 | POST | `/api/v1/public/reservation-actions/{token}/confirm-payment` | public | — |  |
| 155 | POST | `/api/v1/public/reservation-actions/{token}/paid` | public | — |  |
| 156 | POST | `/api/v1/public/reservation-actions/{token}/propose` | public | — |  |
| 157 | POST | `/api/v1/public/reservation-actions/{token}/reject-alternative` | public | — |  |
| 158 | POST | `/api/v1/public/reservations/requests` | public | ModuleStructureTest, MessageAutomationIT, MessagingIT +14 | ✓ |
| 159 | GET | `/api/v1/public/reservations/requests/{reference}/sent` | public | RequestReceiptIT, SalesRequestNotesIT | ✓ |
| 160 | GET | `/api/v1/public/reviews` | public | — | ✓ |
| 161 | GET | `/api/v1/public/site-image-slots` | public | — |  |
| 162 | GET | `/api/v1/public/trip-intents` | public | — | ✓ |
| 163 | GET | `/api/v1/public/trip-ratings` | public | — |  |
