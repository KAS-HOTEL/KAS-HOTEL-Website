# KAS HOTEL – FULL PROJECT AUDIT, TESTING & RESEND EMAIL MIGRATION VERIFICATION

| | |
|---|---|
| Ngày audit | 2026-11-02 (UTC+7) |
| Phạm vi | `Kas_Web_Full/` (backend Spring Boot, frontend HTML + Next.js, DB Flyway, cấu hình Render) |
| Trạng thái Git | branch `snapshot/2026-10-24`, HEAD `8061b9d` (2026-10-31), **50 file sửa + 25 file mới chưa commit**, không có upstream; theo ref cục bộ, `origin/main` = `0a4fdc6` (2026-10-13), HEAD đi trước 5 commit (chưa xác minh được remote thật vì repo private) |
| Nguyên tắc | Không sửa code, không commit, không deploy, không chạm DB thật. Mọi test chạy trên bản sao + PostgreSQL cô lập, dữ liệu giả (`@audit.invalid`). Không ghi secret nào vào báo cáo. |

Ký hiệu trạng thái: **PASS** (có bằng chứng chạy thành công) · **FAIL** (lỗi tái hiện được) · **PARTIAL** · **NOT IMPLEMENTED** · **NOT VERIFIED**.

---

## 1. Executive Summary

**Kết luận chung:** Backend và frontend ở trạng thái kỹ thuật tốt: **toàn bộ 1.111 test backend (221 unit + 890 integration) và 1.423 test frontend đều PASS** khi có môi trường đúng, 48 migration Flyway chạy sạch trên DB trống, typecheck/build OK. Luồng đặt phòng chính (gửi yêu cầu → khách sạn xác nhận qua email → khách báo đã chuyển khoản → khách sạn xác nhận → WON/CONFIRMED) đã được **chạy thật end-to-end** trong môi trường cô lập và hoạt động đúng, kể cả idempotency và 2 lần xác nhận thanh toán đồng thời (chỉ tạo 1 payment).

**Nhưng chưa sẵn sàng production**, vì các lý do chính:

1. **Readiness health check bắt buộc tên DB là `kas_web_dev`** → mọi DB có tên khác trả `503` tại `/actuator/health` (healthCheckPath của Render). Đã tái hiện. (P1)
2. **Chuyển đổi Brevo → Resend chỉ nằm trong working tree chưa commit.** Commit HEAD vẫn dùng Brevo; chưa có lần gửi thật nào qua Resend được xác minh; domain/SPF/DKIM/DMARC chưa kiểm chứng được. (P1)
3. **Hai hệ thống nội dung/ảnh song song:** website production (HTML + `server.js`) đọc ảnh/giá hiển thị từ file JSON trên disk Render và `data.js`, **không** đọc từ admin Spring (Next.js console). Admin cập nhật ảnh/slot/trip-rating trong console không làm thay đổi website. (P1)
4. **Tính năng chưa nối Frontend:** gửi đánh giá (review) và hiển thị review công khai; tích điểm/nâng hạng membership **chưa triển khai**. (P1)
5. **Cấu hình bắt buộc cho production chưa nằm trong code:** owner settings (`SALES_FIRST_CONTACT_SLA`…), email khách sạn/operations, QR thanh toán của từng khách sạn — thiếu một trong các mục này làm luồng đặt phòng dừng (đã tái hiện từng trường hợp). (P1)
6. **`.env` cục bộ chứa dòng email/mật khẩu admin dạng plaintext và khoá Brevo cũ.** (P1 bảo mật)

Không phát hiện lỗi P0 nào tái hiện được (không thấy sai dữ liệu booking/thanh toán hay lỗ hổng xác thực nghiêm trọng).

**Resend – kết luận ngắn:** *Đã tích hợp code (gọi REST API chính thức `https://api.resend.com/emails`) và đã có biến môi trường cục bộ, nhưng code chưa commit/push, chưa gửi thử thành công (không xác minh được), và vẫn còn dấu vết Brevo trong `.env`, commit HEAD và tài liệu.* Chi tiết ở §12.

---

## 2. Kiến trúc project thực tế (theo source code)

```
                         ┌──────────────────────────── Render (render.yaml) ────────────────────────────┐
 Khách (browser) ──────► │ kas-website  : Node/Express server.js (HTML tĩnh + js/*.js)                   │
                         │   • /api/v1/**, /actuator/health → proxy same-origin ─────────────┐           │
                         │   • /api/catalog, /api/admin/* (ADMIN_KEY) → JSON trên disk         │           │
                         │   • disk /var/data (uploads/, kas-config/) 1 GB                     │           │
 Nhân viên/Partner ────► │ kas-console  : Next.js 16 (admin/, partner/, [locale]/ public)      │           │
                         │   • rewrites /api/v1/** → backend ───────────────────────────────┐ │           │
 Link trong email ─────► │ kas-backend  : Spring Boot 3.5.16 / Java 21 (Docker) ◄───────────┴─┘           │
                         │   • Flyway → PostgreSQL (schema kas)                                           │
                         │   • Email outbox (AES-GCM) → Resend REST API (working tree) / Brevo (HEAD)     │
                         │   • Media → Cloudflare R2 (S3 SDK, presigned URL)                              │
                         └────────────────────────────────────────────────────────────────────────────────┘
```

| Hạng mục | Thực tế | Bằng chứng |
|---|---|---|
| Website public (production) | HTML tĩnh + vanilla JS (`frontend/*.html`, `frontend/js/*.js`), phục vụ bởi Express 5 (`frontend/server.js`) | `render.yaml` service `kas-website`, `startCommand: node server.js` |
| Admin / Partner | Next.js 16.3.1, React 19.2, TypeScript 5.7 (`frontend/src/app/admin`, `/partner`); app này **cũng** có trang public `[locale]/` | `frontend/package.json`, build output |
| Admin cũ | `admin.html` + `/api/admin/*` trong `server.js` (khoá `ADMIN_KEY`) — upload ảnh phòng, override giá/ảnh vào JSON | `server.js:427-700` |
| Backend | Spring Boot 3.5.16, Spring Modulith, Spring Security (JWT trong cookie HttpOnly, CSRF double-submit), JdbcClient (không JPA) | `backend/pom.xml`, `SecurityConfig.java` |
| API client | Next: `src/lib/api/client.ts` + `endpoints/*.ts` (đường dẫn tương đối, same-origin). HTML: `js/api.js` (`location.origin`, hoặc `:8080` khi chạy localhost) | |
| Database | PostgreSQL, Flyway 46 versioned + 2 repeatable migration, schema `kas`, 102 bảng | `db/migration/` |
| Storage | (1) R2/S3 qua Spring media module, presigned upload; (2) disk Render `/var/data/uploads` cho admin cũ; (3) ảnh hotlink bên thứ ba trong `js/data.js`, `js/images.js` | §10 |
| Email | Transactional outbox (`email_delivery_outbox`) → `ResendEmailClient` (working tree). HEAD: `BrevoEmailClient` | §12 |
| AuthN/AuthZ | Cookie `kas_access` / `kas_refresh` (HttpOnly, Secure, SameSite=Lax), CSRF cookie `XSRF-TOKEN`, deny-by-default, `@PreAuthorize` theo permission; role CUSTOMER / ADMIN / SUPER_ADMIN (2 bundle không giao nhau) | `SecurityConfig.java`, `RoleCatalogue.java` |
| Deployment | `render.yaml` (3 web service, region singapore); `compose.yaml` (Postgres 17.10 local) | |
| Legacy / gây nhiễu | `frontend/render.yaml` (rỗng), `netlify.toml`, `vercel.json`, `frontend/Dockerfile`, `package (2).json` + `package-lock (2).json` (Render copy đè lên `package.json`), `src/app/demo/` (thư mục rỗng), `db/validation/invariants.sql` (lỗi thời), nhiều tài liệu `KAS_*.md` còn mô tả Brevo | |

---

## 3. Luồng đã hoàn thành (có bằng chứng)

| ID | Nhóm | Luồng | Frontend | Backend | DB | API | Test | Trạng thái | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| A01 | Public | Homepage, Hotels, Hotel detail, Room detail, City guide, Guidebook, After-dark, Experiences, Offers, Support, About | HTML | – | – | `/api/catalog`, `request-pricing` | Playwright: 76 lượt tải (19 trang × desktop/mobile × VI/EN) đều `200`, không tràn ngang; thêm 32 lượt qua proxy same-origin: 0 ảnh local hỏng | PASS (render) | Chất lượng hình ảnh/nội dung không đánh giá; ảnh ngoài (tripcdn/unsplash/kayak) bị chặn trong môi trường audit → NOT VERIFIED |
| A02 | Public | Giá phòng / báo giá | `booking.js`, `live.js` | `PublicAvailabilityController` | rate_day, rate_rule | `GET request-pricing/properties/{slug}`, `POST request-pricing/quote` | Smoke: quote 200, tổng = tổng các đêm; ITs `RateResolutionIT`, `QuoteIT`, `DayPriceReachesGuestIT` | PASS | Gọi không có CSRF → 403 (đúng) |
| B01 | Account | Đăng ký | `app.js` | `CustomerRegistrationService` | app_user, customer, customer_membership, cashback_account | `POST /public/auth/customer-register` | Smoke 201; đăng ký trùng → 409 | PASS | Xem KAS-021 (lộ email đã tồn tại) |
| B02 | Account | Xác thực email (mã 6 số) + gửi lại | `app.js`, `verify-email.html` | `CustomerEmailVerificationService` | customer_email_verification_token | `verify-email`, `resend-verification` | Smoke: mã sai 400; mã đúng 204; dùng lại 400; gửi lại trong 1 phút không tạo mã mới; `CustomerEmailVerificationIT` | PASS | Mã được giải mã từ outbox trong DB cô lập |
| B03 | Account | Đăng nhập / làm mới / đăng xuất | `api.js` | `AuthenticationService` | user_session | `login`, `refresh`, `logout` | Smoke: chưa xác thực → 403 EMAIL_NOT_VERIFIED; login 204 + cookie HttpOnly/Secure; refresh 204; logout 204 → profile 401; `AuthenticationIT` | PASS | |
| B04 | Account | Khoá tài khoản sau 5 lần sai | – | `AuthenticationService` | app_user.locked_until | `login` | Smoke: 5 lần sai → mật khẩu đúng cũng bị từ chối (phản hồi giống hệt) | PASS | |
| B05 | Account | Quên / đặt lại mật khẩu | `app.js` | `CustomerPasswordResetService` | customer_password_reset_token | `forgot-password`, `reset-password` | Smoke: 202 chung cho email có/không tồn tại; reset 204; dùng lại token 400; mật khẩu cũ bị từ chối, mới OK | PASS | Có cooldown 1 phút |
| B06 | Account | Hồ sơ, danh sách lưu trú | `manage-booking.html`, Next `[locale]/account` | `MeCustomerController`, `MeStayController` | | `GET/PUT /me/profile`, `GET /me/stays` | Smoke 200 | PASS | |
| C01 | Booking | Tạo yêu cầu đặt phòng + idempotency | `booking.js`, `api.js` | `PublicReservationRequestController`, `S1Transaction` | reservation, reservation_line… | `POST /public/reservations/requests` | Smoke: 201; gửi lại cùng key → cùng reference; cùng key khác body → 409 IDEMPOTENCY_KEY_REUSED; thiếu key → 400; `ReservationRequestPersistenceIT` | PASS | Cần owner settings — KAS-006 |
| C02 | Booking | Khách sạn xác nhận còn phòng (email action) → gửi QR | email HTML do backend render | `ReservationEmailActionService.approve` | reservation (PAYMENT_PENDING) | `GET/POST /public/reservation-actions/{token}[/approve]` | Smoke: 200, outbox tạo `booking-payment-request-*`; replay token → 404 | PASS | Cần QR payment profile — KAS-008 |
| C03 | Booking | Khách báo đã chuyển khoản | email | `…/paid` | | | Smoke 200, tạo email cho khách sạn; replay → 404 | PASS | |
| C04 | Booking | Khách sạn xác nhận đã nhận tiền → WON/CONFIRMED | email | `confirmPayment` | payment, reservation | `…/confirm-payment` | Smoke: 2 request **đồng thời** → 1×200, 1×404; DB có đúng **1** payment = tổng tiền; email `booking-confirmed-*` được xếp hàng | PASS | Khoá dòng `FOR UPDATE` chặn trùng |
| C05 | Booking | Concurrency / idempotency đặt phòng | – | | | | `ReservationConcurrencyIT`: 11/14 chạy PASS (3 test oversell/hold bị `@Disabled` theo quyết định 153) | PASS (phần còn hiệu lực) | |
| D01 | Partner/Admin | Khách sạn, hạng phòng, giá, chính sách, tiện ích, landmark, experiences, facility, messaging, template, check-in/out/no-show | Next partner/admin | các controller `onboarding`, `pricing`, `reservation` | | | 890 IT (Property*, RoomType*, Rate*, Policy*, Facility, Landmark, Experience, Messaging*, MessageTemplate, AdminOperationsIT…), `StayTransitionServiceTest` | PASS (API) | UI chưa chạy E2E trình duyệt → NOT VERIFIED |
| E01 | Admin | Phân quyền | Next guard | `RoleCatalogue`, `UndeclaredEndpointGuard` | role_assignment | | `RbacAndScopeIT`, `PartnerIsolationIT`, `ConsoleRoleIT`, `DenyByDefaultTest`; smoke: khách → admin 403, SUPER_ADMIN → content/media/review 403 (đúng thiết kế tách 2 role) | PASS | |
| E02 | Admin | Khách hàng, booking, hàng đợi hủy, log automation | Next admin | | | | Smoke với tài khoản SUPER_ADMIN giả lập: 200 | PASS (API) | |
| G01 | Payment | Báo chuyển khoản, xác minh, trạng thái, nhất quán booking/payment | | | payment | | C03–C04 | PASS | |

## 4. Luồng hoàn thành một phần

| ID | Nhóm | Luồng | Trạng thái | Ghi chú / thiếu gì |
|---|---|---|---|---|
| A03 | Public | Tìm khách sạn / theo tag | PARTIAL | Lọc client-side trên `data.js` + `GET /public/trip-intents`; chưa test tương tác |
| A04 | Public | Amenities / Policies trên website | PARTIAL | Backend có API + IT; website HTML chủ yếu dùng nội dung tĩnh `data.js` |
| A05 | Public | Saved Hotels | PARTIAL | Chỉ `localStorage` (`js/saved-hotels.js`), không đồng bộ tài khoản |
| A06 | Public | Responsive | PARTIAL | Desktop 1440 và mobile 390: không tràn ngang. Tablet chưa test |
| A07 | Public | Offers | PARTIAL | Trang tĩnh; không có API offers; backend từ chối `offerCode` (voucher ngoài phạm vi V1) |
| C06 | Booking | Thông báo email | PARTIAL | Tất cả sự kiện xếp hàng đúng vào outbox; **chưa gửi thật** (§12) |
| C07 | Booking | Đề xuất phương án khác | PARTIAL | Có luồng + IT (`AdminOperationsIT`, `BookingEmailLanguageIT`); email không có nút từ chối (KAS-015) |
| C08 | Booking | Từ chối / hủy | PARTIAL | `SalesRequestDeclineIT` (2 skip), `SalesRequestCancelIT` (3 skip) — phần skip là hold/stock đã bỏ |
| C09 | Booking | Hết hạn yêu cầu hủy | NOT VERIFIED | Có migration V36/V37 + scheduler; không có IT riêng |
| E03 | Admin | Theo dõi email | PARTIAL | Chỉ theo từng booking (`GET /admin/sales/requests/{ref}/email-deliveries`); email tài khoản (xác thực/reset/welcome) không có reference nên không xem được; không có message ID / trạng thái delivered (KAS-018) |
| E04 | Admin | Site content / image slots / media | PARTIAL | API + IT có; R2 chưa cấu hình trong audit; **không ảnh hưởng website HTML** (KAS-013) |
| E05 | Admin | Voucher | PARTIAL | CRUD có; không áp dụng được khi đặt phòng (chủ đích V1) |
| E06 | Admin | Membership | PARTIAL | Chỉ xem hạng/điểm; không chỉnh, không có tích điểm |
| E07 | Admin | Audit log | PARTIAL | Có ghi (`AuditLogger`, `SensitiveKeyRedactor`), không có màn hình/API xem |
| E08 | Admin | Dashboard | NOT VERIFIED | Trang Next build OK; chưa chạy trình duyệt |
| F01 | Membership | Đăng ký hội viên | PASS | Tạo membership + hạng MEMBER + ví điểm khi đăng ký |
| F02 | Membership | Thông báo hội viên | PARTIAL | Chỉ MEMBER_WELCOME |
| G02 | Payment | Chống giao dịch trùng | PARTIAL | Khoá dòng ngăn trùng khi xác nhận; không có ràng buộc DB 1 payment/booking, không lưu mã giao dịch ngân hàng (KAS-022) |

## 5. Luồng chưa triển khai / chưa nối Frontend

| ID | Luồng | Trạng thái | Bằng chứng |
|---|---|---|---|
| N01 | Gửi đánh giá của khách (`POST /api/v1/me/reviews`) | NOT IMPLEMENTED ở frontend | Không có caller trong `frontend/src`, `frontend/js` |
| N02 | Hiển thị review công khai (`GET /api/v1/public/reviews`) | NOT IMPLEMENTED ở frontend | Website dùng số liệu tĩnh `rating/reviews` trong `js/data.js:69,118,181…` |
| N03 | Trip.com rating công khai (`GET /api/v1/public/trip-ratings`) | NOT IMPLEMENTED ở frontend | Admin sửa được (`PUT …/trip-rating`) nhưng website không đọc |
| N04 | Tích điểm (EARN) | NOT IMPLEMENTED | Không có code ghi `cashback_ledger` loại EARN; chỉ có scheduler hết hạn (`CashbackExpiryScheduler`) |
| N05 | Nâng hạng hội viên + email tier upgrade | NOT IMPLEMENTED | Không có code ghi `customer_membership_tier_history` ngoài lúc đăng ký; không có template `MEMBER_TIER_UPGRADE` |
| N06 | Quyền lợi hội viên (giảm giá) | NOT IMPLEMENTED | Bảng `membership_discount_policy` có, không được dùng khi báo giá |
| N07 | VietQR động (số tiền + nội dung) | NOT IMPLEMENTED | Mỗi khách sạn lưu 1 URL ảnh QR tĩnh (`PaymentProfileRequest.qrImageUrl`) |
| N08 | Email STAY_COMPLETED | NOT IMPLEMENTED | `.env` còn biến template Brevo nhưng không có template/code |
| N09 | UI cho: gán người phụ trách (`…/assign`), `…/win`, amenities & trạng thái hạng phòng, publish/translations media, trạng thái media link | NOT IMPLEMENTED ở frontend | `KAS-API-MATRIX.csv` |
| N10 | Bộ test E2E trình duyệt (Playwright) trong repo | NOT IMPLEMENTED | Không có cấu hình/thư mục E2E |

---

## 6. Danh sách lỗi phát hiện

Định dạng đầy đủ (điều kiện tái hiện, ảnh hưởng, đề xuất) cũng có trong `KAS-AUDIT-ISSUES.csv`.

### P1 – High

**KAS-001 · Readiness bắt buộc DB tên `kas_web_dev` → `/actuator/health` 503 nếu khác**
- Tái hiện: chạy backend với DB `kas_web_smoke` → `GET /actuator/health` = 503, readiness DOWN; đổi sang DB tên `kas_web_dev` → 200 UP. (Đã chạy cả hai.)
- File: `backend/src/main/java/com/kas/platform/web/DatabaseSchemaHealthIndicator.java:36,46` (`EXPECTED_DATABASE = "kas_web_dev"`, chỉ profile `web-test` dùng `kas_web_test`).
- Ảnh hưởng: `render.yaml` dùng `healthCheckPath: /actuator/health` → nếu DB Render không tên đúng `kas_web_dev` và user `kas_web_app`, deploy không bao giờ "live". Ngược lại, buộc production dùng DB tên "dev".
- Đề xuất: đưa tên DB/role mong đợi vào biến môi trường (vd. `KAS_EXPECTED_DB_NAME`), mặc định giữ hành vi hiện tại ở local.

**KAS-002 · Migration Resend chưa commit, chưa push**
- Bằng chứng: `git status` — `BrevoEmailClient.java` bị xoá, `ResendEmailClient.java`, `EmailTemplates.java`, `email-templates/` là untracked; HEAD `8061b9d` vẫn chứa Brevo; branch không có upstream.
- Ảnh hưởng: Render deploy từ GitHub sẽ không có Resend; mất working tree = mất migration.
- Đề xuất: review diff, commit theo nhóm (email / console role / UI), push và deploy staging trước.

**KAS-003 · Chưa xác minh gửi thật qua Resend; domain/SPF/DKIM/DMARC chưa kiểm chứng**
- Bằng chứng: `api.resend.com` bị chặn từ cả hai môi trường audit (proxy 403); không có công cụ DNS. Sender domain trong `.env`: `@kasluxuryhotel.com`.
- Đề xuất: gửi 1 email thử tới địa chỉ trong allowlist trên staging; kiểm tra Resend dashboard: domain *Verified*, bản ghi SPF/DKIM (`resend._domainkey`), DMARC.

**KAS-004 · `.env` cục bộ chứa thông tin đăng nhập admin plaintext + khoá Brevo cũ; định dạng hỏng**
- Bằng chứng: `Kas_Web_Full/.env` có các dòng không phải `KEY=VALUE` chứa email + mật khẩu admin; còn `BREVO_API_KEY` và 18 biến `BREVO_TEMPLATE_*`. File được `.gitignore` (không bị commit), nhưng nằm trong thư mục dự án/backup.
- Ảnh hưởng: lộ tài khoản dùng chung nếu thư mục bị nén/chia sẻ; dòng sai định dạng có thể làm `docker compose`/dotenv parse lỗi.
- Đề xuất: xoá các dòng đó khỏi `.env`, **đổi mật khẩu admin**, thu hồi khoá Brevo trên dashboard Brevo, lưu secret trong trình quản lý mật khẩu.

**KAS-006 · DB mới: tạo booking lỗi 422 `CONFIG_MISSING SALES_FIRST_CONTACT_SLA`**
- Tái hiện: DB vừa migrate → `POST /public/reservations/requests` = 422. Chỉ chạy được sau khi nạp `src/test/resources/db/test-fixtures/owner-settings.sql` (5 khoá: `SALES_FIRST_CONTACT_SLA`, `DIRECT_REQUEST_HOLD_DURATION`, `INVENTORY_HORIZON_MONTHS`, `MAX_ROOMS_PER_REQUEST`, `DEPOSIT_REQUIRED_TO_CONFIRM`).
- Ảnh hưởng: production phải có sẵn các `system_setting` này; không có script production nào cung cấp.
- Đề xuất: thêm vào checklist triển khai + endpoint/kiểm tra readiness cho owner settings.

**KAS-007 · Email cho khách sạn thất bại khi property không có email và thiếu `KAS_BOOKING_OPERATIONS_EMAIL`**
- Tái hiện: booking trên khách sạn seed → outbox `booking-hotel-* FAILED HOTEL_EMAIL_MISSING`.
- Ảnh hưởng: khách sạn không biết có booking mới.
- Đề xuất: đặt email cho từng property hoặc bắt buộc `KAS_BOOKING_OPERATIONS_EMAIL` (startup report hiện chỉ ghi `operationsEmail=missing`).

**KAS-008 · Khách sạn bấm "Xác nhận còn phòng" bị 422 nếu chưa cấu hình QR; trang hiện JSON thô**
- Tái hiện: `POST /public/reservation-actions/{token}/approve` → 422 `Hotel payment QR is not configured…`, trình duyệt hiển thị JSON.
- File: `ReservationEmailActionService.java:93-108`, `PublicReservationEmailActionController.java`.
- Đề xuất: kiểm tra QR trong checklist; trả về trang HTML thân thiện cho lỗi.

**KAS-009 · Review chưa nối Frontend** (N01–N03). Đề xuất: thêm form review sau lưu trú + hiển thị review đã duyệt trên trang khách sạn.

**KAS-010 · Membership: tích điểm và nâng hạng chưa triển khai** (N04–N06). Cần quyết định nghiệp vụ trước khi làm.

**KAS-011 · Ảnh upload & override của admin cũ không nằm trong Git, phụ thuộc disk Render**
- Bằng chứng: `git ls-files frontend/uploads` = 0 (234 MB, 8 thư mục chỉ có ở máy local); trên Render `UPLOAD_DIR=/var/data/uploads`, `KAS_CONFIG_DIR=/var/data/kas-config`; `frontend/data/runtime/collection-images.json` (154 tham chiếu `/uploads/…`) **không** được dùng khi `KAS_CONFIG_DIR` trỏ chỗ khác.
- Ảnh hưởng: tạo service mới / mất disk → mất toàn bộ ảnh admin cũ và mapping (trang tự quay về ảnh hotlink).
- Đề xuất: sao lưu `/var/data` định kỳ; quy trình seed ban đầu; về lâu dài chuyển sang R2 (module media Spring đã có).

**KAS-013 · Admin Spring không điều khiển website production**
- Bằng chứng: website HTML lấy ảnh/giá hiển thị từ `GET /api/catalog` (`server.js:426`, JSON trên disk) và `js/data.js`/`js/images.js`; site-image-slots, media, trip-rating của Spring chỉ dùng trong Next `[locale]` (service `kas-console`).
- Ảnh hưởng: "Admin cập nhật nhưng Frontend không đổi"; 2 nơi quản lý ảnh, dễ lệch.
- Đề xuất: chọn **một** nguồn sự thật (Spring media + slots) và cho website HTML đọc từ `/api/v1/public/site-image-slots`, `/public/properties/{slug}/gallery`.

**KAS-020 · Khách không nhận được email khi yêu cầu bị từ chối**
- Bằng chứng: `AdminSalesRequestController.decline` (dòng ~156) không gọi `BookingNotificationService`; `bookingCancelled()` chỉ chọn booking có trạng thái `CANCELLED` (`BookingNotificationService.java:122-140`), không phải `DECLINED`. Tương tự, khi khách từ chối phương án thay thế (`…/reject-alternative`) không có email xác nhận.
- Ảnh hưởng: khách chờ mãi không biết yêu cầu đã bị từ chối.
- Đề xuất: thêm template BOOKING_DECLINED (VI/EN) hoặc dùng BOOKING_CANCELLED cho trạng thái DECLINED; bổ sung IT.

### P2 – Medium

| ID | Mô tả | File / bằng chứng | Đề xuất |
|---|---|---|---|
| KAS-005 | Thiếu `KAS_EMAIL_OUTBOX_ENCRYPTION_KEY` (không có trong `.env`); khoá được suy ra từ JWT secret → đổi JWT secret làm email đang chờ không giải mã được (bị giữ vô hạn) | `EmailOutboxCipher.java:60-75`; startup log `outboxKey=derived` | Đặt khoá riêng 32 byte base64 trên Render (đã khai báo trong `render.yaml`) |
| KAS-012 | Ảnh khách sạn hotlink từ `ak-d.tripcdn.com`, `www.kayak.com`, `images.unsplash.com` | Playwright: hotels.html 50 ảnh tripcdn | Rủi ro bản quyền + link chết; tự host trên R2 |
| KAS-014 | Email thanh toán: bản EN không có ảnh QR; bản VI điền "Xem thông tin trên mã QR" vào ô ngân hàng/chủ TK/số TK; link "đã chuyển khoản" chỉ là text trong mô tả | `BookingNotificationService.java:55-79`, `BOOKING_AVAILABILITY_PAYMENT_EN.html` | Thêm `qrImageUrl` + nút vào template EN/VI; lưu thông tin ngân hàng thật trong payment profile |
| KAS-015 | Email đề xuất phương án khác không có nút từ chối (`rejectUrl` truyền vào nhưng template không dùng) | `ALTERNATIVE_STAY_SUGGESTION_*.html` | Thêm nút |
| KAS-016 | Email xác thực / reset mật khẩu là HTML tối giản viết cứng trong Java, không theo template thương hiệu; `firstName` nhận họ tên đầy đủ | `CustomerEmailVerificationService.java:59`, `CustomerPasswordResetService.java:96`, `CustomerEmailNotifications.java` | Chuyển sang `email-templates/` |
| KAS-017 | Trang email-action do backend render chỉ có tiếng Việt (kể cả trang cho khách EN); CSP `default-src 'none'` chặn inline style → trang không có style; lỗi trả JSON | `PublicReservationEmailActionController.java:160`, `SecurityConfig` CSP | i18n theo quốc gia khách; cho phép `style-src 'unsafe-inline'` riêng route này hoặc dùng class + stylesheet |
| KAS-018 | Không lưu Resend message ID, không có webhook → `SENT` chỉ nghĩa là Resend đã nhận; không có delivered/bounced/complained; không có màn hình theo dõi email tổng | `ResendEmailClient.java:131-133`, `EmailOutboxRepository` | Lưu `id` từ response; thêm webhook Resend; trang admin outbox |
| KAS-019 | Kết quả DEFER (recipient không trong allowlist, thiếu template, 401/403, lỗi giải mã) thử lại mỗi 15 phút **vô hạn**, không cảnh báo | `EmailOutboxDispatcher.java:83-86` | Giới hạn thời gian giữ + cảnh báo |
| KAS-021 | Đăng ký trùng trả 409 `ACCOUNT_ALREADY_EXISTS` → dò được email đã đăng ký | Smoke | Cân nhắc phản hồi chung + email thông báo |
| KAS-022 | Không có ràng buộc DB "≤1 payment VERIFIED/booking"; không lưu mã giao dịch ngân hàng (`payment.external_reference` không bao giờ được ghi); QR tĩnh | `V15__payment.sql`, `ReservationEmailActionService.java:345` | Partial unique index; nhập mã giao dịch khi xác nhận |
| KAS-023 | Endpoint backend không có UI: assign, win, amenities/status hạng phòng, media publish/translations/link status, customer detail | `KAS-API-MATRIX.csv` | Quyết định giữ/bỏ |
| KAS-024 | 2 nguồn giá: `reference.html` + `KAS_RATES` (override qua `/api/admin/room-rates`) vs giá Spring dùng khi báo giá | `js/live.js:70-90`, `server.js:557` | Trang tham khảo nên đọc giá Spring |
| KAS-025 | Tài khoản nhân viên dùng chung theo role (quyết định doc 154) → audit log không phân biệt người thao tác | `SharedAdminAccountProvisioning.java` | Cân nhắc tài khoản riêng từng người |
| KAS-026 | Có 2 site public (HTML trên `kas-website` và Next `[locale]` trên `kas-console`) | build output, `render.yaml` | Chặn/redirect public trên console hoặc gỡ |

### P3 – Low

| ID | Mô tả | Bằng chứng |
|---|---|---|
| KAS-030 | `SecurityBoundaryTest` (bộ unit) cần DB → FAIL khi không có PostgreSQL (500), mâu thuẫn quy ước "unit test không cần DB" | `SecurityBoundaryTest.java:113`, log `Connection to 127.0.0.1:5433 refused` |
| KAS-031 | 12 IT bị skip vì giả định trạng thái seed (`noPublishedSeedProperties`) → phụ thuộc thứ tự test | `PublicAmenityIT` 11, `OnboardingWorkflowIT` 1 |
| KAS-032 | `db/validation/invariants.sql` lỗi thời: dừng ở dòng 94 (`customer.customer_code` NOT NULL) | chạy trên DB test |
| KAS-033 | Tài liệu/comment lỗi thời: `db/migration/README.md` ("No migration files…"), `application-test.yml` ("22 checksums") | |
| KAS-034 | Tài liệu vẫn mô tả Brevo: `KAS_ADMIN_SCREEN_CHECKLIST.md`, `KAS_API_CATALOG/INVENTORY_2026-10-24.md`, `KAS_CODE_AUDIT_2026-10-24.md`, `docs/kas/155-…`, `docs/verification/2026-10-25-*` | |
| KAS-035 | ESLint: 0 lỗi, 60 cảnh báo (biến không dùng, `<img>`) | |
| KAS-036 | ~100 cột FK không có index (chủ yếu `created_by/updated_by`) | truy vấn `pg_constraint` |
| KAS-037 | Dev local: backend mặc định `KAS_CUSTOMER_SITE_BASE_URL=127.0.0.1:3010`, `js/api.js` gọi thẳng `:8080` khi chạy localhost, nhưng CORS chỉ cho 3000/3001 → website trên cổng 3010 bị chặn CORS (đã tái hiện) | `SecurityConfig.java:146`, `js/api.js:4-6` |
| KAS-038 | Mỗi lượt xem trang ẩn danh gọi `/me/profile` + `/auth/refresh` → 2 lỗi 401 trong console | Playwright 28/32 trang |
| KAS-039 | Build `kas-website` copy `package (2).json` đè `package.json`; nhiều file deploy legacy | `render.yaml` |
| KAS-040 | Lease outbox 2 phút < thời gian xấu nhất 1 batch (20 × ~11 s) → nhiều instance có thể claim lại (Idempotency-Key của Resend giảm thiểu trong 24 h) | `EmailOutboxRepository.java:23-30` |
| KAS-041 | Lỗi validation 4xx của Resend (vd. 422) bị coi là RETRY, tốn 8 lần thử | `ResendEmailClient.java:143-144` |
| KAS-042 | Audit chạy PostgreSQL 16.15; `compose.yaml` dùng 17.10; phiên bản Render chưa biết | |

---

## 7. Kết quả toàn bộ test (chạy mới trong audit này)

Môi trường: frontend chạy trên máy ảo Linux của Cowork (Node 22.23.4, `npm ci` sạch trên **bản sao** working tree, không đụng `node_modules` của bạn). Backend chạy trong container cloud (Java 21.0.12, Maven 3.9.11 offline với kho `.m2` của bạn; PostgreSQL 16.15 cô lập `127.0.0.1:5433`, DB `kas_web_test`/`kas_web_dev` tạm, dữ liệu giả).

| Hạng mục | Lệnh | PASS | FAIL | ERROR | SKIPPED | Ghi chú |
|---|---|---:|---:|---:|---:|---|
| FE TypeScript | `npx tsc --noEmit` | ✔ | 0 | – | – | |
| FE ESLint | `npx eslint .` | ✔ | 0 lỗi | – | – | 60 warning |
| FE Vitest (unit/component/API client) | `npx vitest run` | 1.423 (87 file) | 0 | 0 | 0 | |
| FE Production build | `npx next build` | ✔ | – | – | – | 60+ route |
| BE compile | `mvn -o test-compile` | ✔ | – | – | – | |
| BE unit + architecture (không DB) | `mvn -o test` | 220 | **1** | 0 | 0 | `SecurityBoundaryTest.publicSurfaceIsNotBlockedBySecurity` (cần DB) — KAS-030 |
| BE Flyway migration | `KAS_TEST_DB_MIGRATE=apply mvn surefire:test -Dtest=IntegrationDatabaseMigration` | 1 | 0 | 0 | 0 | 48/48 migration áp dụng, version 46, 102 bảng |
| BE unit + architecture (có DB) | `mvn -o verify` (surefire) | 221 | 0 | 0 | 0 | |
| BE integration (security, concurrency, transaction, DB) | `mvn -o verify` (failsafe, 65 lớp IT) | 855 | 0 | 0 | 35 | 23 `@Disabled` (quyết định 153 bỏ stock/hold) + 12 skip giả định (KAS-031) |
| DB invariants script | `psql -f db/validation/invariants.sql` | – | **1** | – | – | Script lỗi thời — KAS-032 |
| Runtime smoke API (curl, backend jar thật) | `smoke_*.sh` | 40+ kiểm tra | 0 lỗi nghiệp vụ | – | – | §3; lỗi cấu hình KAS-006/007/008 tái hiện |
| Browser smoke (Playwright Chromium) | 19 trang × 2 viewport × 2 ngôn ngữ | 76/76 HTTP 200, 0 tràn ngang | – | – | – | Lần 2 qua proxy: 32/32, 0 ảnh local hỏng |
| Next.js console (admin/partner) trong trình duyệt | – | – | – | – | – | **NOT VERIFIED** (không có bộ E2E; chỉ build + Vitest) |

Kết quả cũ trong `backend/target/surefire-reports` (31/10) **không** được dùng làm bằng chứng.

---

## 8. Bảng API Frontend – Backend

Đầy đủ 157 endpoint: **`docs/audit/KAS-API-MATRIX.csv`** (method, endpoint, handler file:dòng, xác thực, caller frontend, kết quả). Phân tích tĩnh (regex trên `src/**` và `js/**`, có giải các helper đường dẫn) + kiểm tra tay các trường hợp còn nghi vấn.

| Kết quả | Số lượng |
|---|---:|
| Có frontend caller | 135 |
| Trang email do backend render (đúng thiết kế) | 7 |
| Không có caller | 15 (2 có tài liệu ghi chủ đích: `GET /public/locations`, `POST /admin/rate-rules`) |
| Frontend gọi endpoint không tồn tại | 0 |
| Sai HTTP method | 0 |

| API | Frontend caller | Backend endpoint | Method | Auth | Kết quả |
|---|---|---|---|---|---|
| Đăng ký/đăng nhập/refresh/logout/verify/reset | `js/api.js:92-105`, `src/lib/api/endpoints/auth.ts` | `/api/v1/public/auth/*` | POST | Public + CSRF | CONNECTED, smoke PASS |
| Hồ sơ / lưu trú / hủy | `js/api.js:106-110`, `customerStays.ts` | `/api/v1/me/profile`, `/me/stays…` | GET/PUT/POST | Cookie | CONNECTED |
| Báo giá | `js/booking.js:23`, `js/live.js:17` | `/public/request-pricing/*` | GET/POST | Public | CONNECTED, PASS |
| Đặt phòng | `js/api.js:112` | `/public/reservations/requests` | POST + `Idempotency-Key` | Public + CSRF | CONNECTED, PASS |
| Review khách | – | `POST /me/reviews`, `GET /public/reviews` | | | **NO FE CALLER** (KAS-009) |
| Trip rating | – | `GET /public/trip-ratings` | | | **NO FE CALLER** |
| Sales assign / win | – | `/admin/sales/requests/{ref}/assign`, `/win` | POST | permission | **NO FE CALLER** |
| Hạng phòng amenities / status | – | `PATCH …/room-types/{id}/amenities`, `/status` | PATCH | permission | **NO FE CALLER** |
| Media publish / translations / link status / customer detail / policy by id | – | xem CSV | | | **NO FE CALLER** |
| Email actions | link trong email | `/public/reservation-actions/{token}[/…]` | GET/POST | Token 256-bit, bỏ qua CSRF | Backend-rendered, PASS |

API legacy ngoài Spring (Express `server.js`): `GET /api/catalog` (public), `/api/admin/*` (15 route, header `x-admin-key`, so sánh timing-safe) — dùng bởi `admin.html` và website.

CORS / CSRF / session: same-origin qua proxy ở cả 2 frontend (đã kiểm chứng proxy của `server.js`); CSRF double-submit hoạt động (POST thiếu header → 403); cookie `kas_access`/`kas_refresh` HttpOnly + Secure + SameSite=Lax. Không có endpoint nào thiếu xác thực ngoài nhánh `/api/v1/public/**` (deny-by-default + `UndeclaredEndpointGuardTest`).

---

## 9. Báo cáo Database

| Kiểm tra | Kết quả |
|---|---|
| Migration | 46 versioned (V1–V46) + 2 repeatable; áp dụng sạch trên DB trống (PG 16.15), `validateOnMigrate=true`, `cleanDisabled=true` — PASS |
| Version hiện tại (production) | NOT VERIFIED (không truy cập DB thật) |
| Ràng buộc | 100 PK, 202 FK, 43 UNIQUE, 280 CHECK; mọi bảng có PK; 273 index |
| Index | ~100 cột FK không có index đứng đầu (chủ yếu cột audit) — KAS-036 |
| Transaction | Booking (`S1Transaction`), email action (`@Transactional` + `FOR UPDATE`), outbox ghi trong cùng transaction nghiệp vụ — PASS qua IT + smoke đồng thời |
| Idempotency | `reservation_request_idempotency` (V24) + fingerprint — PASS |
| Toàn vẹn thanh toán | Không có unique constraint chặn >1 payment VERIFIED — KAS-022 |
| Rollback | Flyway chỉ tiến (không có undo migration); cần backup trước mỗi migration |
| Backup | Repo không có cấu hình backup tự động; có dump thủ công trong `db-backups/` (22–24/10) và `local-backups/`. Backup Render: NOT VERIFIED |
| Script kiểm tra invariants | Lỗi thời — KAS-032 |
| Owner settings bắt buộc | 5 khoá `system_setting` phải có — KAS-006 |
| Health check danh tính DB | Cứng `kas_web_dev`/`kas_web_app` — KAS-001 |

---

## 10. Báo cáo Storage & Image mapping

| Kiểm tra | Kết quả |
|---|---|
| Upload (Spring) | R2 presigned PUT, kiểm tra magic bytes (`MagicBytesTest`), `MediaUploadIT`, `R2StorageProviderTest` (fake storage) — PASS ở mức test; **R2 thật NOT VERIFIED** (không có credentials trong audit) |
| Thay ảnh / xoá / cover / thứ tự | API + IT (`MediaIT`, `MediaCoversIT`, `HeroCoverIntegrityIT`, `ArchivedMediaIntegrityIT`) — PASS |
| Signed URL | `presign-ttl` 10 phút; delivery URL qua `KAS_MEDIA_DELIVERY_BASE_URL` |
| Hero slots / site image slots | `site_image_slot` (V39) + `AdminSiteImageSlotController` — chỉ ảnh hưởng Next `[locale]` |
| Upload (legacy Express) | multer, giới hạn 10 MB, chỉ JPG/PNG/WEBP, ghi `/var/data/uploads`, manifest JSON không public |
| Ảnh website production | Từ `/api/catalog` (JSON disk) + fallback `js/images.js` / `js/data.js` → phần lớn là **hotlink** tripcdn/kayak/unsplash (KAS-012) |
| Admin cập nhật nhưng frontend không đổi | **Có** — giữa console Spring và website HTML (KAS-013) |
| Ảnh mất sau deploy | Rủi ro khi disk Render mới/mất (KAS-011); ảnh local 234 MB không có trong Git |
| Ảnh trùng / sai mapping | `js/api-map.js` ánh xạ đủ 48/48 room id của `data.js` sang slug Spring — PASS (tĩnh) |
| URL không tồn tại | 0 ảnh local hỏng trên 32 lượt tải (với disk uploads rỗng). Ảnh ngoài: NOT VERIFIED (bị chặn mạng trong audit) |
| Cache ảnh cũ | `/uploads` `maxAge 1h`; `/api/catalog` `no-store` |
| Không di chuyển/xoá ảnh | Tuân thủ — chỉ đọc |

---

## 11. Báo cáo Deployment (Render) & CloudFront

| Hạng mục | Đánh giá |
|---|---|
| Backend service | Docker multi-stage Temurin 21, chạy user không root, `MaxRAMPercentage=75` — OK. **Health check fail nếu tên DB ≠ `kas_web_dev`** (KAS-001) |
| Website service | `node server.js`, bắt buộc `KAS_API_ORIGIN` + `ADMIN_KEY` mạnh khi production (fail-fast) — OK; disk 1 GB cho uploads/config |
| Console service | `npm ci && npm run build`, `npm start`; rewrites `/api/v1/**` → backend — OK; không khai báo healthCheckPath |
| Biến môi trường | `render.yaml` đã chuyển sang `RESEND_*`; cần đặt: `KAS_DB_*`, `KAS_JWT_SIGNING_SECRET`, `KAS_EMAIL_OUTBOX_ENCRYPTION_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `KAS_BOOKING_OPERATIONS_EMAIL`, `KAS_R2_*`, `KAS_MEDIA_DELIVERY_BASE_URL`, `ADMIN_KEY`. **Không** có `KAS_EMAIL_ALLOWED_RECIPIENTS`/`KAS_EMAIL_REQUIRE_ALLOWLIST` → production gửi cho mọi người (đúng ý), staging phải tự đặt allowlist |
| PostgreSQL | Không tạo DB (đúng chủ đích); tên DB/role phải khớp KAS-001 |
| HTTPS / proxy | Express `trust proxy 1`; Spring HSTS 1 năm; cookie Secure |
| CORS | Danh sách cứng (`kasluxuryhotel.com`, localhost 3000/3001); kiến trúc same-origin nên không cần thêm domain onrender |
| Trạng thái Render thật | NOT VERIFIED (không có quyền truy cập) |
| CloudFront phía trước Render | Khả thi nếu: origin HTTPS tới `kas-website`/`kas-console`; behavior `/api/*`, `/actuator/*` **CachingDisabled**, forward **mọi cookie** (`kas_access`, `kas_refresh`, `XSRF-TOKEN`), header `X-XSRF-TOKEN`, `Idempotency-Key`, `Content-Type`, mọi query string, cho phép GET/HEAD/OPTIONS/PUT/POST/PATCH/DELETE; tĩnh (`/css`, `/js`, `/assets`, `/uploads`) có thể cache + invalidation khi deploy. Link email trỏ thẳng `kas-backend.onrender.com` (`KAS_BOOKING_ACTION_BASE_URL`) — nếu đặt CloudFront trước backend thì behavior này cũng phải tắt cache. NOT VERIFIED (không thay đổi DNS/CDN) |

---

## 12. Báo cáo chi tiết migration Brevo → Resend

### 12.1 Bằng chứng trong code (working tree)

| Thành phần | File / class / method | Ghi chú |
|---|---|---|
| Transport | `shared/ResendEmailClient.java` — `sendTemplate()`, `sendInline()`, `post()` | REST chính thức `POST https://api.resend.com/emails`, `Authorization: Bearer <kas.resend.api-key>`, header `Idempotency-Key` = UUID từ event key; connect timeout 3 s, request 8 s. **Không dùng SDK** (không có dependency resend trong `pom.xml`) |
| Cấu hình | `application.yml:99-102` `kas.resend.{api-key,from-email,from-name}` ← `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | Provider duy nhất; không có `EMAIL_PROVIDER`, không fallback |
| Dispatcher | `shared/EmailOutboxDispatcher.java` — `dispatchDue()` mỗi 5 s, batch 20, tối đa 8 lần, backoff 30 s→1 h | Tạm dừng (không tiêu lần thử) khi thiếu key |
| Outbox | `shared/EmailOutboxService.java`, `EmailOutboxRepository.java`, bảng `email_delivery_outbox` (V44) | Mã hoá AES-GCM, `event_key` UNIQUE (chống trùng), `FOR UPDATE SKIP LOCKED`, lease 2 phút (khôi phục khi crash), xoá payload khi xong |
| Templates | `shared/EmailTemplates.java` + `resources/email-templates/` | 6 key × VI/EN: MEMBER_WELCOME, BOOKING_REQUEST_RECEIVED, BOOKING_AVAILABILITY_PAYMENT, BOOKING_CONFIRMED, BOOKING_CANCELLED, ALTERNATIVE_STAY_SUGGESTION; escape HTML |
| Startup report | `shared/EmailDeliveryStartupReport.java` | Log trạng thái key/sender/outbox key (không lộ giá trị) |
| Brevo trong source/config | `git grep brevo|sendinblue` trên `backend/src`, `pom.xml`, `render.yaml`, `frontend/src`, `frontend/js`, `server.js` | **0 kết quả** (working tree) |
| Brevo còn sót | Commit HEAD (`BrevoEmailClient.java` + 9 file); `.env` (`BREVO_API_KEY`, 18 `BREVO_TEMPLATE_*`); 11 tài liệu `.md/.json` | |

### 12.2 Checklist 15 điều kiện

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Dùng SDK/API chính thức | PASS — REST API chính thức (không SDK) |
| 2 | Email service gọi Resend thực tế | PASS (code + 18 unit test với HttpClient giả) · gửi thật NOT VERIFIED |
| 3 | Còn gọi Brevo API/SMTP | Không (working tree) · **Có** ở commit HEAD |
| 4 | Provider mặc định là Resend | PASS (duy nhất) |
| 5 | Fallback sang Brevo | Không có |
| 6 | Dùng đúng `RESEND_API_KEY` | PASS; `.env` có giá trị dạng `re_…` (37 ký tự) |
| 7 | `EMAIL_FROM` hợp lệ | `RESEND_FROM_EMAIL` có, domain `kasluxuryhotel.com`; tên biến khác `EMAIL_FROM` |
| 8 | Domain đã verify trong Resend | NOT VERIFIED |
| 9 | SPF / DKIM / DMARC | NOT VERIFIED |
| 10 | Email xác thực dùng Resend | PASS (qua outbox, `sendInline`) — smoke tạo outbox row đúng |
| 11 | Reset mật khẩu dùng Resend | PASS (như trên) |
| 12 | Booking confirmation/cancellation dùng Resend | PASS (outbox `booking-confirmed-*` tạo trong smoke; cancelled qua IT) |
| 13 | Membership welcome / tier upgrade | Welcome PASS · Tier upgrade **NOT IMPLEMENTED** |
| 14 | Outbox: retry, idempotency, trạng thái | PASS (unit + smoke); thiếu message ID, DEFER vô hạn (KAS-018/019) |
| 15 | Admin theo dõi được | PARTIAL — theo từng booking; không xem được email tài khoản |

### 12.3 Kiểm thử Resend (mục IV.D)

| Bước | Kết quả |
|---|---|
| Gửi email thử / API response / message ID / delivery status | **NOT VERIFIED** — `api.resend.com` bị chặn từ cả 2 môi trường audit; không gửi email nào |
| Provider rejection, timeout, retry, duplicate prevention, crash recovery, không gửi lặp | PASS ở mức unit test (`ResendEmailClientTest` 18, `EmailOutboxDispatcherTest` 6, `EmailOutboxCipherTest` 4, `EmailTemplatesTest` 3) + smoke DB thật: payload được mã hoá và giải mã đúng; việc bỏ mã xác thực quá 30 phút chỉ được kiểm chứng bằng unit test |

### 12.4 Template email (mục IV.C)

| Template | VI/EN | Subject | Biến | Vấn đề |
|---|---|---|---|---|
| Member welcome | ✔/✔ | ✔ | khớp | `firstName` = họ tên đầy đủ |
| Email verification | inline Java | ✔ | – | Không theo template (KAS-016) |
| Password reset | inline Java | ✔ | – | Link `KAS_CUSTOMER_SITE_BASE_URL/{locale}/account/reset-password` → redirect tới `manage-booking.html` |
| Booking request received | ✔/✔ | ✔ | khớp | |
| Booking accepted (payment instructions) | ✔/✔ | ✔ | EN thiếu `qrImageUrl`; VI không có `paymentUrl` | KAS-014 |
| Booking rejected (decline) | ✗ | – | – | **Không gửi email nào** khi admin từ chối (KAS-020) |
| Booking confirmed | ✔/✔ | ✔ | khớp | |
| Cancellation | ✔/✔ | ✔ | khớp | |
| Alternative offer | ✔/✔ | ✔ | `rejectUrl` không dùng | KAS-015 |
| Tier upgrade | ✗ | – | – | NOT IMPLEMENTED |
| Email cho khách sạn | inline, chỉ tiếng Việt | ✔ | – | |
| Mobile rendering / HTML rendering trên mail client | NOT VERIFIED | | | |

Ngôn ngữ chọn theo **quốc gia** khách (`EmailLanguage.forCountry`), không theo `locale` đăng ký (IT `BookingEmailLanguageIT` PASS).

### 12.5 Kết luận phân loại

| Giai đoạn | Trạng thái |
|---|---|
| Chưa triển khai Resend | ✗ |
| Đã cài SDK nhưng chưa tích hợp | ✗ (không dùng SDK) |
| **Đã tích hợp code** | ✔ — nhưng **chỉ trong working tree, chưa commit** |
| **Đã cấu hình môi trường** | ✔ cục bộ (`.env`), `render.yaml` đã khai báo biến; Render thật NOT VERIFIED |
| Đã gửi thử thành công | **Chưa xác minh** |
| Đã chuyển hoàn toàn khỏi Brevo | ✗ — còn Brevo trong commit HEAD, `.env`, tài liệu |
| Vẫn còn phụ thuộc Brevo | Ở runtime working tree: **không**. Ở bản đã commit/deploy: **có thể** |

→ **Giai đoạn hiện tại: "Đã tích hợp code + cấu hình cục bộ, chưa commit, chưa gửi thử thành công."**

---

## 13. Rủi ro theo mức độ

| Mức | ID |
|---|---|
| P0 | Không có lỗi tái hiện được |
| P1 | KAS-001, 002, 003, 004, 006, 007, 008, 009, 010, 011, 013, 020 |
| P2 | KAS-005, 012, 014, 015, 016, 017, 018, 019, 021, 022, 023, 024, 025, 026 |
| P3 | KAS-030 → 042 |

## 14. Kế hoạch khắc phục (thứ tự ưu tiên)

1. **Bảo mật ngay:** dọn `.env` (KAS-004), đổi mật khẩu admin dùng chung, thu hồi khoá Brevo.
2. **Chốt mã nguồn:** review & commit working tree theo nhóm (email Resend; console role; UI), push lên GitHub (KAS-002). Cập nhật/loại tài liệu Brevo (KAS-034).
3. **Gỡ chặn deploy:** cho tên DB/role mong đợi cấu hình được (KAS-001); viết script/checklist owner settings (KAS-006); đặt `KAS_EMAIL_OUTBOX_ENCRYPTION_KEY` riêng (KAS-005).
4. **Xác minh Resend trên staging:** verify domain + SPF/DKIM/DMARC, gửi thử tới allowlist, kiểm tra từng template VI/EN trên Gmail/Outlook/mobile (KAS-003); sửa template thanh toán & đề xuất (KAS-014/015); lưu message ID + webhook (KAS-018).
5. **Dữ liệu vận hành:** email từng khách sạn hoặc `KAS_BOOKING_OPERATIONS_EMAIL` (KAS-007), QR + thông tin ngân hàng từng khách sạn (KAS-008), trang lỗi email-action thân thiện + song ngữ (KAS-017).
6. **Ảnh & nội dung:** backup `/var/data` ngay; quyết định một nguồn sự thật (Spring media/R2) và nối website HTML (KAS-011/013); thay ảnh hotlink (KAS-012).
7. **Tính năng còn thiếu (cần quyết định nghiệp vụ):** review (KAS-009), membership tích điểm/nâng hạng (KAS-010), VietQR động + mã giao dịch (KAS-022).
8. **Chất lượng:** bộ E2E Playwright cho website + console, sửa `SecurityBoundaryTest` & test phụ thuộc thứ tự (KAS-030/031), cập nhật `invariants.sql` (KAS-032), index FK cần thiết (KAS-036), CORS dev (KAS-037).

## 15. Checklist nghiệm thu production

- [ ] Working tree đã commit, push; commit deploy = commit đã test (ghi rõ SHA)
- [ ] `.env` sạch; mật khẩu admin đã đổi; khoá Brevo đã thu hồi
- [ ] Tên DB/role khớp health check (hoặc KAS-001 đã sửa) và `GET /actuator/health` = 200 trên Render
- [ ] Backup DB production trước migration; kiểm tra restore được
- [ ] `flyway_schema_history` production = V46, không bản ghi lỗi
- [ ] 5 owner settings có trong `system_setting`
- [ ] `KAS_JWT_SIGNING_SECRET`, `KAS_EMAIL_OUTBOX_ENCRYPTION_KEY` (32 byte base64) đã đặt
- [ ] `RESEND_API_KEY`, `RESEND_FROM_EMAIL` đặt; domain *Verified*; SPF, DKIM, DMARC đạt
- [ ] Log khởi động: `Email delivery: dispatcher=on resendKey=set sender=set outboxKey=dedicated operationsEmail=set`
- [ ] Email thử tới hộp thư nội bộ: xác thực, reset, welcome, request received, payment (VI + EN), confirmed, cancelled, alternative
- [ ] Mọi khách sạn có email nhận booking và QR/thông tin chuyển khoản
- [ ] R2: upload → publish → hiển thị ảnh qua `KAS_MEDIA_DELIVERY_BASE_URL`
- [ ] Disk `/var/data` có `uploads/` và `kas-config/` đầy đủ; đã có bản sao lưu
- [ ] Smoke: đăng ký → xác thực → đăng nhập → đặt phòng → khách sạn duyệt → báo chuyển khoản → xác nhận → email confirmed
- [ ] Console admin & partner: đăng nhập 2 role, mở mỗi màn hình chính, không lỗi console
- [ ] Website VI/EN trên desktop, tablet, mobile; không ảnh hỏng
- [ ] Nếu dùng CloudFront: `/api/*` không cache, forward cookie + `X-XSRF-TOKEN` + `Idempotency-Key` + query string, cho phép mọi method

---

## Phụ lục A – Những gì đã và chưa kiểm tra

**Đã kiểm tra (có bằng chứng):** cấu trúc repo & Git; toàn bộ test FE/BE; 48 migration trên DB trống; ràng buộc/index DB; luồng xác thực khách hàng; luồng đặt phòng → thanh toán → xác nhận qua email action (kể cả đồng thời); API admin với tài khoản SUPER_ADMIN giả; outbox email (mã hoá/giải mã/hết hạn); 19 trang website trên 2 viewport × 2 ngôn ngữ; đối chiếu 157 endpoint với frontend; cấu hình Render/Docker/CORS/CSRF/cookie.

**Chưa kiểm tra / không thể kiểm tra:** gửi email thật qua Resend, DNS domain, Render & DB production, R2 thật, ảnh từ CDN ngoài, Next.js console trong trình duyệt, tablet, hiển thị email trên mail client, remote GitHub (repo private), CloudFront.

## Phụ lục B – Tác động của audit lên máy bạn

- Không sửa/xoá file nào của dự án; không commit; không đụng `node_modules` hay DB local.
- File mới: `docs/audit/KAS-HOTEL-FULL-PROJECT-AUDIT.md`, `docs/audit/KAS-AUDIT-ISSUES.csv`, `docs/audit/KAS-API-MATRIX.csv`.
- 3 file nén tạm để chuyển mã nguồn/kho Maven sang môi trường Java 21 nằm trong `C:\Users\Admin\.m2\` (ngoài dự án): `kas-audit-m2-repo.tgz`, `kas-audit-backend-src.tgz`, `kas-audit-frontend-src.tgz` — có thể xoá an toàn.
