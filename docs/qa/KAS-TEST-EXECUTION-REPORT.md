# KAS — Test Execution Report (05/11/2026)

| | |
|---|---|
| Phạm vi | Toàn hệ thống: website HTML + `server.js`, console Next.js, backend Spring Boot, PostgreSQL |
| Mã nguồn | branch `snapshot/2026-10-24`, HEAD `d45389a` + bản sửa QA trong commit đi kèm báo cáo này |
| Môi trường | Local Windows: PostgreSQL Docker `kas_web_test` (127.0.0.1:5433), backend 8080 của chủ dự án (không đụng tới), backend QA cô lập 8081 (tắt gửi email, khoá outbox riêng), website QA 3000, console 3002 |
| Không làm | Không deploy, không đụng production/webdemo, không gửi email thật, không thanh toán, không tích hợp SePay |
| Test case | [KAS-TEST-CASE-INVENTORY.md](KAS-TEST-CASE-INVENTORY.md) |

## 1. Tổng quan kết quả

### Bộ test tự động (chạy lại sau khi sửa)

| Bộ test | Số lượng | Kết quả | Ghi chú |
|---|---|---|---|
| Backend unit (`mvn verify`, surefire) | 235 | **235 PASS** | |
| Backend integration (failsafe, PostgreSQL thật) | 902 | **867 PASS, 0 FAIL, 35 SKIP** | +1 test mới (QA-001). 35 skip: 11 phụ thuộc seed (KAS-031), 3 oversell/hold bị tắt theo quyết định 153, còn lại skip có chủ đích trong các suite sales |
| Frontend Vitest | 1.413 (91 file) | **1.413 PASS** | Lần chạy đầu 5 test timeout 5 s do máy đang chạy Maven; chạy lại đạt (QA-010) |
| TypeScript `tsc --noEmit` | – | PASS | |
| ESLint | – | 0 lỗi, 68 cảnh báo | KAS-035 |
| `next build` (console) | – | PASS | `Compiled successfully`, có Proxy |
| `node --check` website JS | 24 file `js/*.js` + `server.js` | PASS | |
| Smoke live `qa/smoke/kas-smoke.mjs` | 89 kiểm tra × 2 khách | **89/89 PASS** (khách A và B) | |

### Kiểm thử thủ công / bán tự động

| Nhóm | Số lần đo | Kết quả |
|---|---|---|
| Booking E2E API (backend QA cô lập) | 14 kịch bản | 12 PASS, 1 FAIL (QA-004), 1 FIXED→PASS (QA-001) |
| Responsive: 12 trang × 8 độ rộng | 96 | Trước sửa: 11 lỗi (4 trang); sau sửa: **0** |
| Trình duyệt: đăng nhập, lưu khách sạn, Saved Hotels 3 kích thước, popup header | 12 | 11 PASS, 1 FIXED→PASS (QA-005) |
| Mapping website ↔ backend | 8 khách sạn | 8/8 khớp tên và số loại phòng |
| Hiệu năng local | 9 endpoint × (30 tuần tự + 20 song song) | 0 lỗi, p95 ≤ 39 ms |

### Thống kê test case (inventory)

146 test case có dòng riêng trong inventory (chưa tính 4 mục mapping tóm tắt ở §10 của inventory):

| Trạng thái | Số TC |
|---|---|
| PASS | 113 |
| FIXED→PASS (lỗi tìm thấy, đã sửa, chạy lại đạt) | 9 |
| FAIL còn mở | 7, cộng 1 TC đạt một phần (TC-REQ-05: decline đúng nhưng không gửi email). Mới: QA-003 (TC-AZ-05, TC-SEC-11), QA-004 (TC-BKG-14), QA-012 (TC-NAV-04); đã biết: KAS-013, KAS-020, KAS-022 |
| PARTIAL | 1 |
| BLOCKED | 5 |
| NOT RUN | 8 |
| N/A (không áp dụng theo thiết kế) | 2 |

## 2. Lỗi phát hiện trong đợt này

| ID | Mức | Mô tả | Nguyên nhân gốc | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| **QA-001** | **High** | Khách huỷ yêu cầu đặt phòng của chính mình → **500 INTERNAL_ERROR** | `CustomerCancellationService.cancelReservation` so sánh cột enum `sales_status`/`stay_status` với tham số varchar (`operator does not exist: sales_status = character varying`). Endpoint chưa từng có test | **Đã sửa** (`CAST(:fromStatus AS sales_status/stay_status)`), thêm IT `customerCancelsOwnRequestedStayInsideTheFreeWindow` — fail khi chưa sửa, pass khi đã sửa; chạy lại live: 200 CANCELLED, lần 2: 409 | IT + E2E-API |
| **QA-002** | Medium | Header trên điện thoại (đã đăng nhập) rộng hơn màn hình: nút menu bị đẩy ra ngoài 16 px (390), 33 px (360); trang chủ lố 50 px | Không phần tử header nào được co (`flex-shrink:0`), logo cố định 140–180 px | **Đã sửa** (`responsive.css`, chỉ ≤480 px): logo co được, khoảng cách hẹp lại; logo vẫn hiển thị đầy đủ | sweep 360/390 |
| QA-003 | Low | Khách đã đăng nhập gọi API admin với tham số thiếu/sai nhận **400 VALIDATION_FAILED** (lộ tên tham số) thay vì 403. Với request hợp lệ vẫn 403, không lộ dữ liệu | Spring kiểm tra/binding tham số trước `@PreAuthorize` cấp method; tầng URL chỉ yêu cầu `authenticated()` | Mở. Không sửa vì doc 59 cấm kiểm tra theo role; đề xuất thêm một permission "console access" kiểm tra ở tầng URL cho `/api/v1/admin/**` | SMK-CUS-04/05 |
| QA-004 | Medium | `MAX_ROOMS_PER_REQUEST = 5` nhưng backend nhận yêu cầu **50 phòng** (KAS0504041, 135.000.000 VND) | Giới hạn chỉ còn trong luồng tồn phòng đã gỡ theo quyết định 153; website cũng không chặn | Mở — **cần chủ dự án xác nhận** giới hạn này còn áp dụng cho yêu cầu đặt phòng hay không (không tự đổi logic booking) | E2E-API + DB |
| **QA-005** | Medium | Trái tim trên `hotels.html` mất trạng thái đã lưu sau khi danh sách vẽ lại (tải dữ liệu live, đổi bộ lọc) | `paint()` dựng lại card với `aria-pressed="false"` nhưng không gọi `App.paintSaveButtons` (các trang khác có gọi) | **Đã sửa** (`hotels.html`) | trình duyệt |
| **QA-006** | Medium | `hotels.html` tràn ngang 140 px ở 768 px (và 768–1024) | `.hero .searchbar` 5 cột cố định ưu tiên hơn rule tablet `.searchbar{1fr 1fr}` | **Đã sửa** (`responsive.css`): 2 cột ở 768–1024 | sweep |
| QA-007 | Low | 4 trang City Guide tràn 8 px mọi desktop; City Guidebook tràn 2 px trên mobile | `width:100vw` gồm thanh cuộn (Windows); lề âm 18 px > gutter 16 px | **Đã sửa** (`overflow-x:clip`, vẫn giữ sticky) | sweep |
| QA-008 | Low | `server.js` in "KAS server running" rồi thoát mã 0 khi cổng bị chiếm | Express 5 truyền lỗi listen vào callback, code bỏ qua | **Đã sửa**: báo lỗi, thoát mã 1 | CLI |
| QA-009 | Low (test) | `CustomerEmailVerificationIT` fail trên DB test dùng chung (đếm mọi email chào mừng, kể cả của lượt test tay) | Truy vấn không giới hạn theo tài khoản của test | **Đã sửa** (đếm theo user). `BookingEmailLanguageIT` còn một assert toàn cục yếu (`> 0`) | mvn verify |
| QA-010 | Low | Vitest timeout 5 s khi máy bận | `testTimeout` mặc định | Mở — đề xuất tăng `testTimeout` cho các test form | Vitest |
| QA-011 | Low | `GET /public/reservations/requests/{ref}/sent` trả trạng thái + tổng tạm tính cho bất kỳ ai biết mã; mã dạng KAS + 7 chữ số đoán được | Thiết kế trang xác nhận | Mở — không lộ PII; đề xuất token riêng hoặc giới hạn thời gian/tần suất | E2E-API |
| QA-012 | Low | Trang tiếng Việt vẫn thấy "Sign in" lúc tải và placeholder "Your password" | chuỗi cứng trong `app.js` | Mở | trình duyệt |
| QA-013 | Low | Mỗi trang gọi `/me/profile` và `/me/favorites` 2 lần; ẩn danh vẫn gọi `/me/profile` (2×401, KAS-038) | khởi tạo trùng | Mở | network log |
| QA-014 | Low | `CashbackExpiryScheduler` và `CancellationRequestExpiryScheduler` không có công tắc bật/tắt | thiếu `@ConditionalOnProperty` | Mở — chỉ quan trọng nếu Render chạy >1 instance | đọc code |
| QA-015 | Medium (vận hành) | `run-kas-local.ps1` chạy backend local ở **chế độ gửi email thật, không allowlist** trên DB test: mọi email gõ khi test tay đều được gửi qua Brevo | cấu hình script | Mở — đề xuất bật allowlist khi chạy local | đọc script |

Không phát hiện lỗi Critical: không sai giá, không sai dữ liệu booking, không vượt quyền, không lộ dữ liệu khách.

## 3. Lỗi của audit 02/11 — trạng thái hiện tại

| ID | Mô tả ngắn | Hiện tại |
|---|---|---|
| KAS-001 | Health bắt buộc DB `kas_web_dev` / role `kas_web_app` | Mở; `render.yaml` dùng đúng tên nên không chặn deploy |
| KAS-006 | DB mới thiếu owner settings → đặt phòng 422 | Mở — **bắt buộc xử lý trước khi mở production** (checklist Render) |
| KAS-007 | Email khách sạn thiếu → `HOTEL_EMAIL_MISSING` | Mở — đặt `KAS_BOOKING_OPERATIONS_EMAIL` |
| KAS-008 | Duyệt qua email lỗi 422 khi khách sạn chưa có QR | Mở — nhập payment profile |
| KAS-009 | Review chưa nối website | Mở |
| KAS-010 | Tích điểm/nâng hạng chưa có | Mở (cần quyết định) |
| KAS-011 | Ảnh admin cũ nằm trên disk Render | Mở — bước cut-over doc 156 |
| KAS-013 | Admin Spring không điều khiển ảnh/giá website HTML | Mở (High) |
| KAS-015 | Email đề xuất thiếu nút từ chối | **Đã sửa** trước đợt này |
| KAS-016 | Email xác thực/reset không theo template | **Đã sửa** trước đợt này |
| KAS-020 | Không email khi yêu cầu bị từ chối | Mở (OQ-162) |
| KAS-021 | Đăng ký trùng lộ email | Mở |
| KAS-022 | Không ràng buộc DB 1 payment/booking | Mở |
| KAS-037 | CORS dev không có cổng 3010 | Mở (chỉ dev) |
| KAS-038 | Trang ẩn danh gọi `/me/profile` | Mở |

## 4. Module chưa kiểm thử hoặc bị chặn

| Module | Lý do | Cần gì |
|---|---|---|
| Console Admin/Super Admin trên trình duyệt (duyệt yêu cầu, quản lý khách sạn/ảnh/giá, khách hàng) | Không có tài khoản staff test; theo quy tắc của dự án, tài khoản quản trị do chủ dự án tự tạo | Chủ dự án chạy `SharedAdminAccountProvisioning` với `KAS_ADMIN_DATABASE=kas_web_test` cho 1 ADMIN + 1 SUPER_ADMIN test |
| Admin đổi ảnh/giá → website cập nhật | Như trên + KAS-013 | Quyết định một nguồn ảnh |
| Gửi email thật và kiểm tra hiển thị | Không gửi email thật khi chưa được yêu cầu | Chủ dự án cho phép gửi tới `itkashotel@gmail.com` |
| Backend chạy cấu hình production trên Render | Chưa có repo GitHub / service Render | Theo doc 156 |
| Lọc/sắp xếp tương tác, back/forward, accessibility, trạng thái lỗi khi API timeout | Ngoài thời lượng đợt này | Đợt sau, nên thêm Playwright |
| Membership nâng hạng, review, SePay | Chưa triển khai / ngoài phạm vi | Quyết định nghiệp vụ |

## 5. Các file đã sửa

| File | Thay đổi |
|---|---|
| `backend/src/main/java/com/kas/platform/reservation/CustomerCancellationService.java` | QA-001: ép kiểu enum trong 2 câu UPDATE |
| `backend/src/test/java/com/kas/platform/security/it/CustomerEmailVerificationIT.java` | QA-001: test huỷ của khách; QA-009: đếm email theo tài khoản |
| `frontend/hotels.html` | QA-005: tô lại trái tim sau khi vẽ danh sách |
| `frontend/css/responsive.css` | QA-002 header mobile; QA-006 thanh tìm kiếm tablet |
| `frontend/css/city-guide.css`, `frontend/city-guidebook.html`, `frontend/city-guidebook-vi.html` | QA-007 |
| `frontend/server.js` | QA-008 |
| `render.yaml`, `docs/kas/156-production-render-setup.md` | Sửa cổng nội bộ backend trên Render (`PORT`, mặc định 10000) |
| `qa/smoke/kas-smoke.mjs`, `qa/README.md` | Bộ regression live mới |
| `docs/qa/*`, `docs/deployment/*` | Báo cáo này |

## 6. Dữ liệu test đã tạo

- `kas_web_test`: 2 khách QA (`qa-customer-a/b@kas-qa.invalid`, đánh dấu đã xác thực trực tiếp trong DB test), 4 yêu cầu đặt phòng QA (KAS0588375, KAS0558290, KAS0504041, KAS0564510) — **đã huỷ cả 4**; 22 dòng email outbox của QA (mã hoá bằng khoá test, không gửi được) — **đã xoá**. Audit log append-only nên tài khoản QA không xoá được (giữ để chạy lại smoke).
- Không có email nào được gửi ra ngoài trong đợt này: backend QA tắt dispatcher; backend 8080 thử các thư QA và báo `PAYLOAD_DECRYPTION_FAILED`.

## 7. Kết luận

**Chưa sẵn sàng mở production cho khách.** Lý do không phải chất lượng code (không còn lỗi Critical, các luồng booking, xác thực, phân quyền đều đạt), mà là các điều kiện vận hành bắt buộc chưa có:

1. Chưa có môi trường Render (repo GitHub, DB, secret) — checklist [KAS-RENDER-DEPLOYMENT-CHECKLIST.md](../deployment/KAS-RENDER-DEPLOYMENT-CHECKLIST.md).
2. DB production phải nạp owner settings (KAS-006), payment profile/QR từng khách sạn (KAS-008) và email nhận booking (KAS-007), nếu không luồng đặt phòng dừng.
3. Điều khoản, chính sách no-show chưa duyệt (gate trong `KAS_PRODUCT_DECISIONS_TO_CONFIRM.md`).
4. Chưa kiểm thử console bằng tài khoản staff (BLOCKED) và KAS-013 (ảnh website không do Admin Spring điều khiển) còn mở.
5. QA-004 cần chủ dự án quyết định.

Có thể **deploy lên Render ở chế độ nội bộ** (allowlist email bật, chưa trỏ domain chính) ngay khi có repo và secret.

## 7b. Cập nhật sau đợt sửa theo phương án đã duyệt (05/11 chiều)

| Mục | Trạng thái mới | Commit |
|---|---|---|
| KAS-020 email khi từ chối | Đã có từ trước (ROOM_UNAVAILABLE); nay gửi template Brevo `BOOKING_REQUEST_REJECTED` (22/23) kèm lý do | `a2760b9` |
| Gỡ Resend | Code, cấu hình, webdemo không còn Resend | `218fc22` |
| KAS-038 trang ẩn danh gọi `/me/profile` | Sửa (cờ trạng thái đăng nhập) | `49ea1b0` |
| QA-013 gọi API trùng | **Đính chính: không phải lỗi** — một lần tải chỉ gọi mỗi API một lần; số liệu cũ gộp 2 lượt tải | – |
| QA-012, QA-014, QA-010, KAS-001, KAS-037 | Sửa | `49ea1b0` |
| QA-015 chạy local gửi email thật | `run-kas-local.ps1` mặc định allowlist, `-RealEmail` để bật | (ngoài repo) |
| Rate limit theo IP, QA-011 | Sửa (`RateLimitFilter`, `server.js` chuyển IP thật) | `c410364` |
| QA-003 400 trước 403 | Sửa (`ConsoleAccess` ở tầng URL) | `c410364` |
| KAS-008/017 trang email-action | Sửa (HTML VI/EN, CSP hash, lỗi thành trang) | `c410364` |
| QA-004 giới hạn số phòng | Chủ dự án quyết: **không giới hạn** — giữ nguyên | – |
| Website đọc API (ẩn/xoá/thêm khách sạn) | Sửa (`/properties/catalogue`, `catalog-sync.js`); kiểm thử ẩn hotel-08 và thêm khách sạn QA trên trình duyệt | `be620b3` |
| KAS-013 ảnh do console quản lý; đóng admin cũ | Sửa (`/catalogue/media`, slot console ưu tiên, admin cũ 404, script chuyển ảnh) | `afd51b5` |
| KAS-014, KAS-022 (thanh toán) | **Chưa làm** — tạm dừng vì có người đang tạo migration `V48` song song (xem dưới) | – |

**Regression cuối (code đã commit, worktree sạch):** backend 216 unit đạt; 909 IT: 906 đạt, 35 bỏ qua, **3 lỗi đều ở FlywayHistoryIT** do DB test có 51 migration (gồm V48 bị áp nhầm) còn code đã commit có 50 — tự hết khi V48 được commit. Frontend: Vitest 1.413/1.413, tsc đạt. Smoke trên backend mới: 84/84.

**Sự cố trong đợt này:** backend QA dựng từ thư mục làm việc đã mang theo `V48__silver_default_tier_booking_qualification.sql` (của người khác, chưa commit) và Flyway đã áp nó vào `kas_web_test` lúc 16:10. Không gỡ bằng tay; nếu file `V48` còn bị sửa trước khi commit thì cần xử lý checksum trên `kas_web_test`.

## 8. Bước tiếp theo cho SePay (sau khi deploy Render)

1. Chốt đối soát: 1 booking ↔ 1 giao dịch; thêm ràng buộc DB 1 payment VERIFIED/booking và cột mã giao dịch ngân hàng (KAS-022) bằng migration mới.
2. Sinh nội dung chuyển khoản duy nhất theo mã booking (VietQR động thay QR tĩnh, N07).
3. Webhook SePay: endpoint public riêng, xác thực chữ ký/API key, idempotent theo mã giao dịch, chỉ ghi nhận "đã nhận tiền" khi số tiền + nội dung khớp; vẫn giữ bước khách sạn xác nhận theo quyết định hiện hành.
4. Test bằng sandbox/fixture SePay; không tự động chuyển PAID khi chưa có bằng chứng.
5. Bổ sung kịch bản vào `qa/smoke` và IT cho webhook (trùng, sai chữ ký, sai số tiền, đến muộn).
