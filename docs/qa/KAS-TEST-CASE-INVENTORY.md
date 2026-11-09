# KAS — Test Case Inventory (05/11/2026)

Bộ test case cho KAS Hotel, xây dựng từ source code thực tế của branch `snapshot/2026-10-24` (HEAD `d45389a` + các bản sửa QA chưa commit). Kết quả chạy chi tiết ở [KAS-TEST-EXECUTION-REPORT.md](KAS-TEST-EXECUTION-REPORT.md).

## Kiến trúc thực tế (khác với mô tả trong yêu cầu)

Yêu cầu QA mô tả "Frontend React/TypeScript + Backend Node.js/Express". Thực tế:

| Thành phần | Công nghệ | Vị trí |
|---|---|---|
| Website khách | HTML + JavaScript thuần, phục vụ bởi Express 5 (`server.js`): trang tĩnh, proxy `/api/v1` sang backend, công cụ ảnh cũ `/admin.html` (`ADMIN_KEY`) | `frontend/*.html`, `frontend/js`, `frontend/css`, `frontend/server.js` |
| Console Admin / Super Admin | Next.js 16 + React 19 + TypeScript | `frontend/src/app/admin`, `frontend/src/app/partner` |
| Backend nghiệp vụ | **Spring Boot 3.5 / Java 21** (không phải Node), JdbcClient, Spring Security (cookie HttpOnly + CSRF), Flyway | `backend/` |
| Database | PostgreSQL, schema `kas`, Flyway V1–V47 | `backend/src/main/resources/db/migration` |
| Email | Outbox mã hoá AES-GCM → Brevo (nhà cung cấp duy nhất; Resend đã gỡ 05/11) | `backend/.../shared/Email*` |

Vì vậy công cụ kiểm thử dùng đúng công cụ đã có của project: JUnit 5 + Spring MockMvc + PostgreSQL thật (unit + integration), Vitest (frontend), và bộ smoke live viết bằng Node thuần (`qa/smoke/kas-smoke.mjs`), không cài thêm framework. Supertest không áp dụng vì backend không phải Express; Playwright chưa có trong project, các luồng trình duyệt được kiểm thủ công bằng trình duyệt tích hợp và ghi lại số đo.

## Quy ước

- **Status**: PASS (đã chạy, đúng kỳ vọng) · FAIL (đã chạy, sai) · FIXED→PASS (lỗi phát hiện, đã sửa, đã chạy lại và đạt) · BLOCKED (thiếu điều kiện để chạy) · NOT RUN (chưa chạy).
- **Automation**: `IT` = integration test JUnit/MockMvc trên PostgreSQL `kas_web_test`; `UT` = unit test; `VT` = Vitest; `SMK` = `qa/smoke/kas-smoke.mjs` (chạy được lại trên local/webdemo/staging); `E2E-API` = kịch bản API live trên backend QA cô lập; `Manual` = kiểm tra bằng trình duyệt có số đo.
- **Test data**: tài khoản QA `qa-customer-a@kas-qa.invalid`, `qa-customer-b@kas-qa.invalid` (chỉ trong `kas_web_test`, mật khẩu ở `qa/smoke/.qa-accounts.env`, file bị git ignore); fixture tự tạo/tự dọn của IT; không dùng dữ liệu hay tài khoản production.
- Mã lỗi `QA-0xx` là lỗi phát hiện trong đợt này; `KAS-0xx` là lỗi của audit 02/11 (`docs/audit/KAS-AUDIT-ISSUES.csv`).

---

## 1. Hạ tầng / khởi động

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-INF-01 | Backend khởi động, health UP | DB `kas_web_test` | GET `/actuator/health` | – | 200 `UP` | 200 UP, 61 ms | PASS | Critical | SMK-INF-01 | |
| TC-INF-02 | Website server khởi động | – | GET `/health` | – | 200 `ok:true` | 200 | PASS | Critical | SMK-INF-02 | |
| TC-INF-03 | Website proxy `/api/v1` | backend chạy | so sánh `/api/v1/public/trip-intents` qua site và backend | – | Giống hệt | Giống hệt | PASS | High | SMK-INF-03 | |
| TC-INF-04 | Website biết địa chỉ console | `KAS_CONSOLE_URL` | GET `/site-config.json` | `http://localhost:3002` | JSON, chỉ origin http(s) | Đúng; giá trị `javascript:` bị loại | PASS | Medium | SMK-INF-04 | |
| TC-INF-05 | Website báo lỗi khi cổng bị chiếm | cổng 3001 đang dùng | `PORT=3001 node server.js` | – | Thoát mã ≠ 0, báo lỗi | Trước sửa: in "running", thoát 0 | FIXED→PASS | Low | Manual | QA-008 |
| TC-INF-06 | Console build production | – | `next build` | – | Build thành công | Compiled successfully, có Proxy | PASS | High | Manual (CLI) | |
| TC-INF-07 | Typecheck / lint frontend | – | `tsc --noEmit`, `eslint .` | – | 0 lỗi | tsc 0 lỗi; ESLint 0 lỗi, 68 cảnh báo | PASS | Medium | CLI | cảnh báo = KAS-035 |
| TC-INF-08 | Cú pháp JS website | – | `node --check` mọi `js/*.js`, `server.js` | – | 0 lỗi | 0 lỗi | PASS | Medium | CLI | |
| TC-INF-09 | Flyway khớp lịch sử | DB test | `FlywayHistoryIT` | – | checksum khớp | 7/7 | PASS | Critical | IT | |
| TC-INF-10 | Backend chạy cấu hình production trên Render | secret production | deploy Blueprint | – | health UP | – | BLOCKED | Critical | – | Chưa có service Render/repo GitHub (doc 156) |

## 2. Homepage, Header, Navigation, Contact/Language

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-HOME-01 | Trang chủ tải đủ | – | Mở `/index.html` | – | 200, header dùng chung, 0 ảnh local lỗi | 200, header có, 31 ảnh, 0 lỗi | PASS | High | SMK + Manual | |
| TC-HOME-02 | Không tràn ngang mọi viewport | – | Đo `scrollWidth − clientWidth` | 1920/1440/1280/1024/900/768/390/360 | 0 | 0 ở cả 8 | PASS | Medium | Manual (sweep) | |
| TC-HOME-03 | Header không che/khuất trên mobile (đã đăng nhập) | đăng nhập QA-A | Đo mép phải nút cuối header | 360, 390 | ≤ viewport | Trước sửa: 410 px tại 360 (lố 50) | FIXED→PASS | Medium | Manual | QA-002 |
| TC-HOME-04 | Logo không bị cắt trên mobile | – | So độ rộng ảnh logo với khung | 360 | ảnh ≤ khung | 122/122 px, chữ đầy đủ | PASS | Low | Manual | sau bản sửa QA-002 |
| TC-NAV-01 | Contact và Language loại trừ nhau | – | Mở Contact → mở Language → mở Contact | – | Chỉ 1 popup mở | Đúng | PASS | Medium | Manual | |
| TC-NAV-02 | Header đồng nhất các trang template | – | Kiểm tra `#hdr` trên 11 trang | – | Có header dùng chung | Có ở cả 11 | PASS | High | SMK-WEB-* | |
| TC-NAV-03 | Header sau đăng nhập hiện tên/avatar | đăng nhập QA-A | Đọc `.kas-member-trigger__name` | – | "QA Customer A" | Đúng | PASS | High | Manual | |
| TC-NAV-04 | Nhãn nút đăng nhập theo ngôn ngữ | trang `lang=vi`, chưa đăng nhập | Đọc nút header | – | "ĐĂNG NHẬP" | Thấy "Sign in" lúc tải; placeholder "Your password" | FAIL | Low | Manual | QA-012 |
| TC-NAV-05 | Mục "Trang quản trị" chỉ cho nhân viên | tài khoản staff | – | – | Khách không thấy | Khách không thấy (QA-A) | PASS (khách) | Medium | Manual | phía staff: BLOCKED (cần tài khoản staff test) |
| TC-HOME-05 | Trip intents trả 4 nhóm | – | GET `/public/trip-intents` | – | family, slow, business, long | Đúng | PASS | High | SMK | |
| TC-HOME-06 | Hero lấy ảnh từ Admin Spring | – | – | – | – | Website HTML không đọc slot ảnh Spring (KAS-013) | FAIL (đã biết) | High | – | KAS-013, cần quyết định nguồn ảnh |
| TC-HOME-07 | API lỗi/timeout/không dữ liệu | – | – | – | Trạng thái lỗi thân thiện | – | NOT RUN | Medium | – | cần giả lập lỗi mạng |

## 3. Authentication

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-AUTH-01 | Đăng ký hợp lệ | – | POST customer-register | email `.invalid` | 201, chưa có cookie | 201 | PASS | Critical | IT CustomerEmailVerificationIT; E2E-API | |
| TC-AUTH-02 | Email đã tồn tại | đã đăng ký | đăng ký lại | cùng email | 409 `ACCOUNT_ALREADY_EXISTS` | 409 | PASS | Medium | IT | lộ email đã đăng ký (KAS-021, mở) |
| TC-AUTH-03 | Mật khẩu < 8 ký tự / email sai định dạng / thiếu trường | – | POST | dữ liệu sai | 400 VALIDATION_FAILED | 400 | PASS | High | IT AuthenticationIT | |
| TC-AUTH-04 | Đăng nhập trước khi xác thực email | chưa verify | login | – | 403 EMAIL_NOT_VERIFIED | 403 | PASS | Critical | IT | |
| TC-AUTH-05 | OTP đúng / sai / hết hạn / dùng lại / khoá sau 5 lần sai | – | verify-email | mã 6 số | 204 / 400 / 400 / 400 / khoá | Đúng cả 5 | PASS | Critical | IT (5 test) | |
| TC-AUTH-06 | Gửi lại OTP có cooldown, phản hồi chung | – | resend-verification ×2 | email có/không tồn tại | 202 thông điệp chung, không tạo mã mới | Đúng | PASS | High | IT | |
| TC-AUTH-07 | Đăng nhập thành công, cookie HttpOnly | QA-A đã verify | login | – | 204 + `kas_access` HttpOnly | Đúng | PASS | Critical | SMK-CUS-01; IT | |
| TC-AUTH-08 | Đăng nhập tài khoản không tồn tại | – | login | email ngẫu nhiên | 401, thông điệp chung | 401 chung | PASS | Critical | SMK-AUTH-02 | |
| TC-AUTH-09 | Khoá 15 phút sau 5 lần sai | – | 5 lần sai rồi đúng | – | Bị từ chối | Đúng | PASS | Critical | IT AuthenticationIT | |
| TC-AUTH-10 | Thiếu CSRF token | – | POST login không token | – | 403 | 403 | PASS | Critical | SMK-AUTH-01 | |
| TC-AUTH-11 | Refresh phiên / logout thu hồi phiên | đã đăng nhập | refresh, logout, gọi profile | – | 204, 204, 401 | Đúng | PASS | Critical | SMK-CUS-09/10; IT | |
| TC-AUTH-12 | Phiên cũ không vượt qua xác thực email | – | huỷ verify rồi gọi API | – | 401 / 403 | Đúng | PASS | High | IT | |
| TC-AUTH-13 | Quên / đặt lại mật khẩu, token dùng 1 lần | – | forgot → reset ×2 | – | 202 chung; 204; 400 | Đúng | PASS | High | IT BookingEmailLanguageIT | |
| TC-AUTH-14 | Đăng nhập bằng số điện thoại | – | – | – | – | Hệ thống không hỗ trợ (chỉ email) | N/A | – | – | |
| TC-AUTH-15 | Giới hạn tần suất (rate limit) đăng ký/OTP theo IP | – | – | – | – | Có cooldown theo tài khoản; không có rate limit theo IP | NOT RUN | Medium | – | khuyến nghị lớp proxy/WAF |

## 4. Phân quyền (backend, không chỉ ẩn menu)

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-AZ-01 | Ẩn danh gọi 21 API admin danh sách | – | GET | – | 401/403 | 401 cả 21 | PASS | Critical | SMK-AUTHZ-01 | |
| TC-AZ-02 | Ẩn danh gọi API admin ghi | – | POST/PATCH | – | 401/403 | Đúng | PASS | Critical | SMK-AUTHZ-02 | |
| TC-AZ-03 | Ẩn danh gọi `/me/*` | – | GET 5 endpoint | – | 401 | Đúng | PASS | Critical | SMK-AUTH-06 | |
| TC-AZ-04 | Khách gọi API admin (request hợp lệ) | QA-A | GET rates, rate-rules; POST decline | UUID/ref hợp lệ | 403 | 403 | PASS | Critical | SMK-CUS-05 | |
| TC-AZ-05 | Khách gọi API admin (request thiếu tham số) | QA-A | GET media/covers, rates/*; POST vouchers `{}` | thiếu tham số | 403 | 400 VALIDATION_FAILED (không lộ dữ liệu) | FAIL (Low) | Low | SMK-CUS-04 | QA-003: kiểm tra đầu vào chạy trước `@PreAuthorize` |
| TC-AZ-06 | Console role của khách = NONE | QA-A | GET `/me/console` | – | NONE | NONE | PASS | Critical | SMK-CUS-03 | |
| TC-AZ-07 | ADMIN và SUPER_ADMIN tách quyền | – | – | – | Không giao nhau | Đúng | PASS | Critical | IT ConsoleRoleIT (23), RoleCatalogueTest | |
| TC-AZ-08 | Cách ly đối tác / phạm vi dòng dữ liệu | – | – | – | Không đọc chéo | Đúng | PASS | Critical | IT PartnerIsolationIT, RbacAndScopeIT | |
| TC-AZ-09 | Mọi handler có lớp quyền | – | quét kiến trúc | – | Không thiếu `@PreAuthorize` | Đúng | PASS | Critical | UT DenyByDefaultTest, UndeclaredEndpointGuardTest | 163 endpoint, 0 endpoint không public thiếu guard |
| TC-AZ-10 | Khách B không thấy booking của khách A | A có booking | B GET `/me/stays` | – | Không có ref của A | Không có | PASS | Critical | E2E-API | |
| TC-AZ-11 | Khách B huỷ booking của A | A có booking | B POST cancel | ref của A | 404 | 404 NOT_FOUND | PASS | Critical | E2E-API | |
| TC-AZ-12 | Staff / Admin / Super Admin trên console (E2E) | tài khoản staff test | đăng nhập console | – | Mỗi role thấy đúng menu | – | BLOCKED | High | – | cần chủ dự án tạo tài khoản staff test (quy tắc: chủ dự án tự chạy tool) |

## 5. My KAS (Bookings, Profile, Saved Hotels, Membership)

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-MY-01 | My stays trả đúng phòng, khách, tiền | booking gắn khách | GET `/me/stays` | 4 NL, 2 TE, 2 phòng, 3 đêm | Đúng từng trường | Đúng | PASS | High | IT CustomerEmailVerificationIT | |
| TC-MY-02 | Khách huỷ yêu cầu của chính mình trong thời hạn miễn phí | booking REQUESTED | POST `/me/stays/{ref}/cancel` | – | 200 CANCELLED, ghi lịch sử | Trước sửa: **500** (enum so với varchar) | FIXED→PASS | High | IT mới + E2E-API | QA-001 |
| TC-MY-03 | Huỷ lần 2 | đã huỷ | POST cancel | – | 409 ILLEGAL_TRANSITION | 409 | PASS | Medium | IT + E2E-API | |
| TC-MY-04 | Huỷ tạo email thông báo | – | huỷ | – | outbox `booking-cancelled-*` | Có | PASS | Medium | E2E-API | |
| TC-MY-05 | Chấp nhận / từ chối phí huỷ khách sạn báo | QUOTED | POST cancel/decision | – | – | Chưa có test | NOT RUN | Medium | – | dùng chung SQL đã sửa ở QA-001 |
| TC-MY-06 | Hồ sơ đúng tài khoản | QA-A | GET `/me/profile` | – | email khớp | Khớp | PASS | High | SMK-CUS-02 | |
| TC-MY-07 | Ảnh đại diện: lưu, đổi phiên bản | – | PUT avatar | JPEG nhỏ | lưu theo tài khoản, URL đổi | Đúng | PASS | Medium | IT | |
| TC-MY-08 | Upload ảnh giả định dạng / quá dung lượng | – | – | – | 400 | Kiểm tra magic bytes | PASS | High | UT MagicBytesTest, IT MediaUploadIT | |
| TC-SAV-01 | Lưu / bỏ lưu khách sạn qua API | QA-A | PUT/DELETE favorites | slug thật | danh sách cập nhật, trả lại trạng thái cũ | Đúng | PASS | High | SMK-CUS-07 | |
| TC-SAV-02 | Lưu slug không tồn tại | QA-A | PUT | `no-such-hotel-qa` | 4xx | 4xx | PASS | Medium | SMK-CUS-08 | |
| TC-SAV-03 | Trái tim trên trang chi tiết lưu lên server | QA-A | bấm tim `hotel-03` | – | server có `kas-ancient-boutique-hotel` | Đúng (mapping đúng) | PASS | High | Manual | |
| TC-SAV-04 | Trái tim trên danh sách khách sạn đồng bộ | đã lưu `hotel-03` | mở `hotels.html` | – | tim `hotel-03` đã bật | Trước sửa: tim tắt sau khi danh sách vẽ lại | FIXED→PASS | Medium | Manual | QA-005 |
| TC-SAV-05 | Trang Saved Hotels dùng template chung | – | – | – | header, breadcrumb, footer chung | Đúng | PASS | Medium | SMK + Manual | |
| TC-SAV-06 | Desktop: số loại phòng · giá · XEM PHÒNG cùng hàng | 1 khách sạn đã lưu | đo vị trí | 1440 | cùng hàng | "4 loại phòng · Từ 1.400.000 VND/đêm · Xem phòng" cùng hàng, ảnh 29% | PASS | High | Manual | số liệu khớp API (4 room types) |
| TC-SAV-07 | Tablet 768 | – | đo | 768 | card ngang, không tràn | ngang; nút xuống hàng riêng; tràn 0 | PASS | Medium | Manual | |
| TC-SAV-08 | Mobile 390 | – | đo | 390 | card dọc, nút dễ bấm | dọc, nút 324×48, tràn 0 | PASS | Medium | Manual | |
| TC-SAV-09 | Chưa đăng nhập: empty state mời đăng nhập | ẩn danh | mở trang | – | thông điệp đăng nhập | Đúng | PASS | Low | Manual | |
| TC-SAV-10 | Hai tài khoản không lẫn dữ liệu lưu | A, B | – | – | danh sách tách biệt | Lưu theo tài khoản server (favorites) | PASS | High | SMK (A) | |
| TC-MEM-01 | Hạng / điểm hội viên khi đăng ký | – | – | – | MEMBER + ví điểm | Đúng (F01 audit 02/11) | PASS | Medium | IT | |
| TC-MEM-02 | Tích điểm, nâng hạng, quyền lợi | – | – | – | – | Chưa triển khai (KAS-010) | BLOCKED | High | – | cần quyết định nghiệp vụ |

## 6. Hotel Listing / Search / Hotel Detail / Room

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-HTL-01 | Danh sách 8 khách sạn công khai, slug duy nhất, không DRAFT/CLOSED | – | GET properties | – | 8, duy nhất | 8 | PASS | Critical | SMK-API-PROPS | |
| TC-HTL-02 | Chi tiết / room types / gallery / policies / facilities cho **từng** khách sạn | – | GET ×8 ×5 | – | 200 | 200 cả 40 | PASS | High | SMK-API-PROP-* | |
| TC-HTL-03 | Slug không tồn tại | – | GET | `no-such-hotel-qa` | 404 | 404 | PASS | Medium | SMK-API-404 | |
| TC-HTL-04 | Mapping website ↔ backend (tên, số loại phòng) | – | so `KAS_DATA` với API | 8 khách sạn | khớp | 8/8 khớp: 3/8/4/6/6/9/6/6 | PASS | High | Manual | |
| TC-HTL-05 | Trang danh sách: 8 card, 0 ảnh lỗi | – | mở `hotels.html` | – | 8 card | 8 card, 62 ảnh, 0 lỗi | PASS | High | Manual | |
| TC-HTL-06 | Thanh tìm kiếm tablet | – | đo | 768–1024 | không tràn | Trước sửa: tràn 140 px tại 768 | FIXED→PASS | Medium | Manual | QA-006 |
| TC-HTL-07 | Trang chi tiết hiển thị đúng khách sạn và số loại phòng | – | mở `hotel-03` | – | "KAS Ancient Luxury Hotel", 4 phòng | Đúng, giá từ 1.400.000 | PASS | High | Manual | |
| TC-HTL-08 | Lọc / sắp xếp theo giá, rating, tên; query params; back/forward | – | – | – | – | Chưa chạy tương tác | NOT RUN | Medium | – | |
| TC-HTL-09 | Tìm theo tag mục đích chuyến đi | – | – | – | – | Có API + IT (`PortfolioFilterIT`); chưa chạy tương tác | PARTIAL | Medium | IT | |
| TC-ROOM-01 | Tạo / sửa / đổi trạng thái loại phòng (admin) | – | – | – | – | | PASS | High | IT RoomTypeAuthoringIT, RoomTypeIT | |
| TC-ROOM-02 | Giá theo ngày, theo đêm, base rate, bulk | – | – | – | tổng = tổng các đêm | Đúng | PASS | Critical | IT DayPriceIT, BaseRateIT, RateResolutionIT, QuoteIT (23) | |

## 7. Báo giá và đặt phòng (Critical)

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-BKG-01 | Báo giá hợp lệ | – | POST quote | 2 đêm, 2 NL, 1 phòng | 200 | 200 | PASS | Critical | SMK-PRC-01 | |
| TC-BKG-02 | Check-out trước check-in | – | quote / request | – | 400 | 400 | PASS | High | SMK-PRC-02; E2E-API | |
| TC-BKG-03 | 0 đêm | – | quote | checkIn = checkOut | 400 | 400 | PASS | High | SMK-PRC-03 | |
| TC-BKG-04 | Check-in trong quá khứ | – | quote | −3 ngày | 400 | 400 | PASS | High | SMK-PRC-04 | |
| TC-BKG-05 | 0 phòng / 0 người lớn | – | quote | – | 400 | 400 | PASS | High | SMK-PRC-05/06 | |
| TC-BKG-06 | Room type / khách sạn không tồn tại | – | quote | – | 4xx | 422 NO_AVAILABILITY | PASS | Medium | SMK-PRC-07/08 | |
| TC-BKG-07 | Trẻ em (chưa mở ở V1) | – | quote | 1 trẻ | 4xx | 422 CONFIG_MISSING | PASS | Medium | SMK-PRC-09 | đúng thiết kế (OQ-007) |
| TC-BKG-08 | Tạo yêu cầu hợp lệ (khách đã đăng nhập) | QA-A | POST requests | – | 201, mã KAS…, REQUEST_RECEIVED | 201 KAS0588375 | PASS | Critical | E2E-API; IT ReservationRequestIT (47) | |
| TC-BKG-09 | Tổng tạm tính = tổng dòng = báo giá | – | so DB | – | khớp | total = subtotal = sum(line) = 2.700.000 | PASS | Critical | E2E-API (DB) | |
| TC-BKG-10 | Gửi lại cùng Idempotency-Key | – | POST ×2 | – | cùng mã | cùng mã | PASS | Critical | E2E-API; IT | |
| TC-BKG-11 | Cùng key, body khác | – | POST | – | 409 IDEMPOTENCY_KEY_REUSED | 409 | PASS | Critical | E2E-API | |
| TC-BKG-12 | 5 request song song cùng key (double-click) | – | Promise.all ×5 | – | 1 booking | 5×201 cùng 1 mã | PASS | Critical | E2E-API; IT ReservationConcurrencyIT | |
| TC-BKG-13 | Thiếu Idempotency-Key / body rỗng | – | POST | – | 400, không lưu | 400 | PASS | Critical | SMK-BKG-01/02 | |
| TC-BKG-14 | Vượt `MAX_ROOMS_PER_REQUEST` (=5) | – | POST 50 phòng | – | bị từ chối | **201**, 50 phòng, 135.000.000 VND | FAIL | Medium | E2E-API | QA-004, cần chủ dự án xác nhận |
| TC-BKG-15 | Dữ liệu XSS trong tên/yêu cầu đặc biệt | – | POST | `<script>`, `<img onerror>` | lưu dạng text, hiển thị đã escape | email escape (EmailTemplates), console React escape, website loại ký tự HTML | PASS | High | E2E-API + đọc code | |
| TC-BKG-16 | Không còn tồn phòng / oversell | – | – | – | – | Theo quyết định 153: website không giữ tồn phòng, khách sạn duyệt tay | N/A | – | IT (3 test @Disabled theo quyết định 153) | |
| TC-BKG-17 | Trang "đã gửi" công khai theo mã | – | GET `/public/reservations/requests/{ref}/sent` | mã đoán được | không lộ PII | trả trạng thái + tổng tạm tính, không PII | PASS (Low risk) | Low | E2E-API | QA-011: mã KAS+7 số đoán được |
| TC-BKG-18 | Owner settings thiếu trên DB mới | DB trống | POST requests | – | 422 CONFIG_MISSING | Đúng như audit 02/11 | PASS (đã biết) | High | IT OwnerConfigurationIT | KAS-006: production phải nạp settings |

## 8. Yêu cầu đặt phòng & duyệt của khách sạn/Admin

| ID | Scenario | Preconditions | Steps | Test data | Expected | Actual | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-REQ-01 | Hàng đợi, lọc, đếm, tìm kiếm | – | – | – | | | PASS | High | IT SalesQueueFilterIT (22), ReservationSearchIT (38) | |
| TC-REQ-02 | Liên hệ, ghi chú, timeline, gán | – | – | – | | | PASS | Medium | IT SalesRequestContactIT, NotesIT, TimelineIT | |
| TC-REQ-03 | Khách sạn xác nhận còn phòng qua email (token 1 lần) | – | – | – | PAYMENT_PENDING, replay 404 | Đúng (audit 02/11 smoke + IT) | PASS | Critical | IT AdminOperationsIT (25) | |
| TC-REQ-04 | Đề xuất phương án khác, khách chấp nhận/từ chối | – | – | – | | | PASS | High | IT AdminOperationsIT, BookingEmailLanguageIT | nút từ chối đã có (KAS-015 đã sửa) |
| TC-REQ-05 | Từ chối yêu cầu (decline) | – | – | – | DECLINED + lịch sử | Đúng; **không gửi email cho khách** | PASS / FAIL (email) | High | IT SalesRequestDeclineIT | KAS-020 (mở) |
| TC-REQ-06 | Hai admin xử lý cùng lúc | – | – | – | 1 thắng, 1 409 | Đúng (khoá dòng) | PASS | Critical | IT SalesWorkflowIT | |
| TC-REQ-07 | Xác nhận thanh toán đồng thời | – | 2 request | – | 1 payment | 1 payment (audit 02/11) | PASS | Critical | IT AdminOperationsIT | |
| TC-REQ-08 | Hết hạn yêu cầu / countdown | – | – | – | EXPIRED | Đúng | PASS | Medium | IT SalesRequestExpiryIT (6) | |
| TC-REQ-09 | Luồng duyệt trên giao diện console | tài khoản staff test | – | – | – | – | BLOCKED | High | – | cần tài khoản staff test |

## 9. Admin Dashboard (API)

| ID | Module | Coverage | Status | Severity | Automation | Notes |
|---|---|---|---|---|---|---|
| TC-ADM-01 | Khách sạn (tạo, thông tin, toạ độ, editorial, publish, submission) | IT PropertyCreationIT, PropertyInformationIT, PropertyCoordinatesIT, PropertyEditorialIT, PropertyPublishIT, OnboardingWorkflowIT | PASS | High | IT | |
| TC-ADM-02 | Tiện ích, chính sách, cơ sở vật chất, landmark, trải nghiệm | PropertyAmenitiesIT, PolicyIT, PolicyModuleIT, FacilityIT, LandmarkIT, ExperienceIT | PASS | Medium | IT | |
| TC-ADM-03 | Media: upload, magic bytes, cover, hero, archive | MediaUploadIT (21), MediaIT, MediaCoversIT, HeroCoverIntegrityIT, ArchivedMediaIntegrityIT | PASS | High | IT | R2 thật chưa cấu hình |
| TC-ADM-04 | Giá: base, ngày, rule, bulk | BaseRateIT, DayPriceIT, RateAuthoringIT | PASS | Critical | IT | |
| TC-ADM-05 | Khách hàng, voucher, review, hội thoại, mẫu tin nhắn, automation | AdminOperationsIT, MessagingIT (24), MessageTemplateIT, MessageAutomationIT | PASS | Medium | IT | |
| TC-ADM-06 | Console Next.js: list/search/filter/form/loading/empty/error | Vitest 91 file, 1.413 test | PASS | Medium | VT | |
| TC-ADM-07 | Console trên trình duyệt với tài khoản thật | – | BLOCKED | High | – | cần tài khoản staff test |

## 10. Mapping Frontend / Admin / Database

Xem [KAS-FRONTEND-ADMIN-MAPPING-REPORT.md](KAS-FRONTEND-ADMIN-MAPPING-REPORT.md). Tóm tắt: TC-MAP-01 khách sạn & số loại phòng PASS; TC-MAP-02 Saved Hotels (id website ↔ slug backend) PASS; TC-MAP-03 ảnh/giá hiển thị website từ Admin Spring FAIL (đã biết, KAS-013); TC-MAP-04 Admin đổi ảnh/giá → website cập nhật BLOCKED (cần tài khoản staff test + quyết định nguồn ảnh).

## 11. Email

| ID | Scenario | Status | Automation | Notes |
|---|---|---|---|---|
| TC-EML-01 | Template VI/EN đủ 12 thiết kế, escape HTML biến | PASS | UT EmailTemplatesTest; đọc code | |
| TC-EML-02 | Ngôn ngữ theo quốc tịch khách | PASS | IT BookingEmailLanguageIT (12) | |
| TC-EML-03 | Outbox mã hoá, không gửi khi thiếu key, giữ thư khi 401/403/quota | PASS | UT EmailOutboxCipherTest, EmailOutboxDispatcherTest, BrevoEmailClientTest (10) | |
| TC-EML-04 | Lỗi nhà cung cấp không làm sập backend | PASS | UT | |
| TC-EML-05 | Brevo key hợp lệ, tài khoản đang giao thư | PASS | gọi API Brevo chỉ đọc (05/11): 38/39 delivered 7 ngày | không gửi thư mới |
| TC-EML-06 | Gửi thật tới hộp thư test, kiểm tra hiển thị/logo/responsive | NOT RUN | – | chỉ gửi tới địa chỉ chủ dự án chỉ định khi được yêu cầu |
| TC-EML-07 | Email khi bị từ chối | FAIL (đã biết) | – | KAS-020 |

## 12. Bảo mật

| ID | Scenario | Actual | Status | Severity | Automation |
|---|---|---|---|---|---|
| TC-SEC-01 | 10 file riêng tư không bị phục vụ (`server.js`, `.env`, `package.json`, `data/…`, traversal `%2e%2e`, `node_modules`) | 404 cả 10 | PASS | High | SMK-SEC-STATIC-* |
| TC-SEC-02 | CORS từ chối origin lạ | không có `Access-Control-Allow-Origin` | PASS | High | SMK-SEC-01 |
| TC-SEC-03 | Header nosniff + chống nhúng khung | Có | PASS | Medium | SMK-SEC-02 |
| TC-SEC-04 | Body > 3 MB | 400, không 500 | PASS | Medium | SMK-AUTH-04 |
| TC-SEC-05 | JSON hỏng | 400 | PASS | High | SMK-AUTH-03 |
| TC-SEC-06 | Chuỗi kiểu SQL injection trong path | 404, không lỗi | PASS | High | SMK-AUTH-05 |
| TC-SEC-07 | Không lộ stack trace trong lỗi | đúng (`include-stacktrace: never`) | PASS | High | SMK (noLeak) |
| TC-SEC-08 | Mật khẩu băm | Argon2id (PasswordEncoderTest) | PASS | Critical | UT |
| TC-SEC-09 | `.env` không commit | `.gitignore` có `.env`, `*.env` | PASS | Critical | git check-ignore |
| TC-SEC-10 | Health production không lộ chi tiết | `show-details: when-authorized` (dev: always) | PASS | Medium | đọc cấu hình |
| TC-SEC-11 | Kiểm tra quyền trước kiểm tra đầu vào | không (400 trước 403) | FAIL | Low | SMK-CUS-04/05 (QA-003) |

## 13. Responsive / UI

Quét tự động 12 trang × 8 độ rộng (1920, 1440, 1280, 1024, 900, 768, 390, 360) = 96 lần đo: tràn ngang, header vượt viewport, logo bị cắt, ảnh local lỗi. Sau các bản sửa QA-002/006/007: **0 lỗi**.

| ID | Scenario | Actual | Status | Severity |
|---|---|---|---|---|
| TC-UI-01 | Header mobile đã đăng nhập (360/390) | trước: lố 16–50 px | FIXED→PASS | Medium |
| TC-UI-02 | Thanh tìm kiếm `hotels.html` 768–1024 | trước: lố 140 px | FIXED→PASS | Medium |
| TC-UI-03 | City Guide (4 trang) tràn 8 px mọi desktop | `100vw` gồm thanh cuộn | FIXED→PASS | Low |
| TC-UI-04 | City Guidebook tràn 2 px ở mobile | lề âm 18 px > gutter 16 px | FIXED→PASS | Low |
| TC-UI-05 | Thanh breadcrumb/mục lục vẫn sticky sau sửa | top 76 px / 62 px khi cuộn | PASS | Low |
| TC-UI-06 | Lỗi console | chỉ 401 khi ẩn danh (KAS-038); mỗi trang gọi `/me/profile`, `/me/favorites` 2 lần | PASS (Low) | Low |
| TC-UI-07 | Accessibility (bàn phím, nhãn, tương phản) | chưa kiểm tra có hệ thống | NOT RUN | Medium |

## 14. Hiệu năng (local, quy mô nhỏ)

| ID | Scenario | Actual | Status |
|---|---|---|---|
| TC-PERF-01 | API public: 30 request tuần tự | p95 17–39 ms, 0 lỗi | PASS |
| TC-PERF-02 | 20 request song song mỗi endpoint | thời gian tổng 15–61 ms, 0 lỗi | PASS |
| TC-PERF-03 | Trang/asset website | p95 ≤ 18 ms; `/api/catalog` 101 KB, `app.js` 68 KB | PASS |
| TC-PERF-04 | Tải trên Render / dữ liệu lớn / N+1 | – | NOT RUN (không chạy tải lên production theo yêu cầu) |

## 15. Thanh toán (chưa tích hợp SePay)

| ID | Scenario | Status | Notes |
|---|---|---|---|
| TC-PAY-01 | Tổng tiền booking, trạng thái thanh toán, xác nhận thủ công | PASS | IT AdminOperationsIT; không có logic tự đánh dấu PAID |
| TC-PAY-02 | 1 payment/booking ở mức DB | FAIL (đã biết) | KAS-022: chỉ dựa vào khoá dòng, chưa có ràng buộc DB |
| TC-PAY-03 | SePay | NOT RUN | ngoài phạm vi theo yêu cầu |
