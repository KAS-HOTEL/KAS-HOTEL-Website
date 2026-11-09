# KAS — Báo cáo rà soát và checklist 25 hạng mục

Cập nhật lần cuối ngày 25/10/2026 theo snapshot cục bộ `284d6a2` và thay đổi chưa commit. Không lấy được cập nhật mới hơn từ GitHub do kết nối mạng không phân giải được máy chủ. Phần chuyển đổi admin xem [checklist triển khai](docs/kas/155-admin-console-migration.md); bằng chứng mới nhất trong [ghi chú Brevo và test web](docs/verification/2026-10-25-admin-ui/BREVO_AND_TEST_WEB.md).

## Quy tắc sản phẩm hiện tại

1. **Website không quản lý hoặc nhận dữ liệu tồn phòng.** Admin tự kiểm tra phòng thủ công bên ngoài website. Không làm stock calendar, hold, buffer, trừ/hoàn tồn, nhãn còn/hết phòng hay tự động kiểm tra tồn. Giữ loại phòng, sức chứa, số lượng khách yêu cầu và giá tham khảo.
2. Yêu cầu → khách sạn kiểm tra → gửi QR/hướng dẫn → khách báo chuyển khoản → khách sạn xác minh tiền → xác nhận lưu trú. Khách báo chuyển khoản không phải xác minh tiền. Chấp nhận phương án thay thế tạo yêu cầu mới; GET email chỉ đọc.
3. **Một tài khoản SUPER_ADMIN dùng chung bằng email/mật khẩu**, phục vụ cả `/admin` và `/partner`, theo quyết định 154. CUSTOMER giữ email/mật khẩu riêng. Không có admin dùng chung-login. Partner self-registration đã rút; `/partner/register` trả not-found.
4. Không bật lại 2FA bắt buộc. Sau 5 lần sai mật khẩu liên tiếp, khóa đăng nhập 15 phút; đăng nhập thành công hoặc reset hợp lệ xóa bộ đếm. Không chạy provisioning hoặc đưa mật khẩu thật vào tài liệu/log.

Nguồn hiện tại:

- `docs/kas/153-owner-decision-no-website-inventory.md` — không tồn phòng.
- `docs/kas/154-owner-decision-shared-admin-account.md` — tài khoản admin dùng chung, thay thế đề xuất key trước đó.
- `docs/kas/152-owner-decision-manual-booking-email-flow.md` — kiểm tra/phương án/QR/xác minh tiền thủ công.
- `docs/kas/155-admin-console-migration.md` — các API/màn hình đã bổ sung và QD-A/B/C.

Chi tiết phần đã gỡ: `KAS_NO_STOCK_CHANGELOG_2026-10-24.md`. Không xóa dữ liệu/database hoặc sửa migration lịch sử để làm sạch source.

## Kiểm chứng hiện tại và giới hạn

- Frontend typecheck: PASS trên mã mới.
- Frontend: **77 files, 1.426 tests PASS**, 0 failed, lần chạy bắt đầu 15:34:43 ngày 24/10/2026, dùng tối đa 3 workers để tránh timeout giả khi máy tải cao.
- Kiểm tra lint source mới được ghi trong tài liệu triển khai; lint toàn frontend vẫn có baseline lỗi legacy. Không coi lint phạm vi sửa là lint toàn repo xanh.
- Migration **V42** đã áp dụng và validate trên riêng **kas_web_test**. Không migrate cơ sở dữ liệu vận hành.
- Integration test mới kiểm tra API nhân viên, QR/tiền, quyền, báo phí, chính sách, URL ảnh, bộ lọc và kiểm duyệt. Số cuối cùng và log: `docs/kas/155-admin-console-migration.md`.
- R2 upload/covers đã được kiểm tra bằng storage giả. Chưa chứng nhận upload R2 thật, gửi Brevo thật hoặc browser E2E/staging.
- Production build PASS khi chạy với mạng để tải Google Fonts; lần trong sandbox trước đó bị chặn tải font. Không dùng cờ bỏ lỗi TypeScript hoặc bỏ kiểm tra build.
- Baseline backend unit/architecture trước đây còn lỗi module/layering/naming. Chưa coi các hạng mục đó đã đóng chỉ vì integration test của các màn hình mới chạy được.

Log cũ no-stock đã chuyển từ `frontend/*.log` sang `docs/legacy-frontend/`. Log phiên mới: `docs/verification/2026-10-24-admin/` và báo cáo trong `backend/target/failsafe-reports`.

## Checklist và phát hiện hiện tại

Trạng thái **Đã làm, chờ E2E** không đồng nghĩa hoàn thành nghiệm thu. **Cần xác minh lại** là có bằng chứng ở baseline hoặc đọc mã, chưa chạy lại toàn bộ sau các thay đổi tiếp theo. Mỗi ID khớp một prompt trong `KAS_CLAUDE_TASK_PROMPTS_2026-10-24.md`.

| ID | Mức | Trạng thái | Công việc / bằng chứng | Điều kiện đóng |
|---|---|---|---|---|
| K01 | P0 | Đã làm, chờ E2E | Đã gỡ stock UI/client/controllers/jobs; quote dùng metadata/giá; cancellation không cần hold. | E2E request → manual review → payment → confirm → free/late cancellation không đọc/ghi stock; API response không có count/availability flag. |
| K02 | P0 | Còn mở | Email action commit/consume token trước khi gọi notification; send bắt lỗi và chỉ log. | Outbox/delivery bền vững, retry/resend theo quyền, UI không báo gửi thành công thiếu bằng chứng. |
| K03 | P1 | Cần xác minh lại | SiteImageSlotController trong `web` gây vòng security → web → security ở baseline architecture tests. | Module boundaries xanh; chuyển CMS đúng module, giữ permission/scope/audit. |
| K04 | P1 | Cần xác minh lại | `MeGuestReviewController.Stay.status` và baseline module list bị architecture tests bắt. | Đặt tên đúng stayStatus, cập nhật baseline có lý do; giữ review eligibility và security tests. |
| K05 | P1 | Làm một phần | Lint phạm vi no-stock xanh; lint toàn repo trước đó có React error-boundaries và CommonJS/legacy scope issues. | Chạy lại full lint; sửa lỗi thật và config theo loại source; không tắt rule toàn dự án. |
| K06 | P1 | Đã triển khai một phần, chờ E2E | Backend reset, typed client và màn Next.js VI/EN `/[locale]/account/reset-password` đã có; link email trỏ sang màn mới. API yêu cầu link và modal HTML cũ vẫn là điểm vào; chưa có màn forgot-password Next.js riêng. Email gửi sau commit; ghi chú 25/10 có test token hết hạn/dùng lại và thu hồi session. | Hoàn thiện entry point quên mật khẩu Next.js, kiểm tra lỗi/expiry/session trên trình duyệt; không phục hồi staff password recovery hoặc partner registration. |
| K07 | P1 | Đã triển khai một phần, còn cần rà soát | Ghi chú 25/10 xác nhận token 30 phút/dùng một lần, thu hồi session, gửi email sau commit; backend integration kiểm tra reset hợp lệ, token dùng lại/hết hạn. | Rà soát limiter/abuse, cạnh tranh tiêu thụ token và policy trên toàn luồng; giữ gửi email ngoài transaction và kiểm tra browser E2E. |
| K08 | P1 | Cần tái hiện | Alternative proposal/accept cần guard quá khứ, expiry và tái kiểm tra publication. | Accept/reject/replay/race an toàn; replacement chỉ là request mới và không tạo stock. |
| K09 | P1 | Đã triển khai, chờ browser E2E | Có `/partner/cancellation-requests`, client và route `/api/v1/admin/ops/...`; kiểm tra báo phí/replay qua DB test. | Nghiệm thu khách accept/decline/expiry 12:00 giờ Việt Nam trên trình duyệt; không tự hủy trước quyết định khách. |
| K10 | P1 | Khoảng trống | Ops list/detail hiện chủ yếu đọc; check-in/check-out/no-show chưa đủ workflow. | Contract/UI/history/permission và điều kiện ngày hợp lệ; không tự bịa phí hay thêm stock. |
| K11 | P1 | Đã nối console với logic email | Có 3 API và nút duyệt QR/đề xuất/xác minh tiền, giữ guard trạng thái và token. Sửa lỗi cast enum PostgreSQL khi duyệt QR. | Còn kiểm tra race console/email/cancel, legacy win, version và delivery bền vững. |
| K12 | P1 | Còn mở | Mail/action pages sau acknowledgement chưa nhất quán VI/EN; formatAmount dùng raw minor. | Locale toàn chuỗi; Money/exponent hoặc enforce VND; không sai số tiền/XSS. |
| K13 | P1 | Xác nhận trong mã | CORS allowed methods thiếu PATCH; topology/comment proxy cần đồng bộ. | Same-origin và cross-origin được hỗ trợ có test origin/method/cookie/CSRF; không wildcard credentials. |
| K14 | P1 | Cần kiểm chứng | Submit replay vẫn gọi notification và có thể issue thêm REVIEW token; provider header chưa là bằng chứng dedupe. | Logical notification/token idempotent ở DB và provider contract được xác minh. |
| K15 | P2 | Xác nhận trong mã | Site image audit role hardcode SUPER_ADMIN; lookup findAll; chưa có bằng chứng version guard. | Role từ actor, lookup theo key, concurrency contract rõ, GLOBAL scope không đổi. |
| K16 | P1 | Đã triển khai các màn được chọn | Có Đánh giá, Voucher, Khách hàng, điểm Trip.com; map/sources/Collection và chính sách dùng chung. Đã sửa bộ lọc null, lỗi HTTP và cập nhật quý cũ không đè điểm hiện tại. | Browser E2E, đầy đủ negative states/permissions và nghiệm thu dữ liệu thật; không tạo lại các màn đã có. |
| K17 | P1 | Có URL HTTPS và giữ R2 | Gallery khách sạn/phòng thêm URL với alt VI/EN; dùng `external_url` V33, giữ publication gates. GLOBAL chọn owner cho R2. | Kiểm tra R2/Brevo/deployment thật, ảnh tương đối và đối chiếu ảnh admin V22; không giả xác minh nguồn ảnh. |
| K18 | P1 | Tài khoản admin dùng chung | Email/mật khẩu, một SUPER_ADMIN GLOBAL, cookie/CSRF; khóa 15 phút sau 5 lần sai. Không có key-login. | Hồi quy auth/reset/refresh/logout và scope/customer isolation theo doc154; không tạo thêm mô hình key/partner signup. |
| K19 | P1 | Chưa nghiệm thu đầy đủ | Còn integration assertions reservation/sales theo hold lịch sử; no-stock unit pass không chứng minh email/cancel E2E. | Chuyển assertion sang no-stock, giữ idempotency/security/payment; chạy test DB disposable + browser với mail/storage fake. |
| K20 | P2 | Đã cập nhật tài liệu hiện tại | Ba tài liệu rà soát/prompt/API đã chuyển sang doc154, QD-A và các màn/API mới. | Tiếp tục sửa comment/README lịch sử sai theo consumer map; không dùng đề xuất key đã rút. |
| K21 | P2 | Đã lưu trữ ghi chú | Đã chuyển 45 file ghi chú/log, có bảng kê trong `docs/legacy-frontend/`. Giữ admin.html/js/admin.js/server.js và dữ liệu ảnh/giá. | Đối chiếu dữ liệu và consumer trước khi gỡ legacy bằng một công việc riêng. |
| K22 | P1 | Migration test đã kiểm chứng | Migration đến V42 đã validate/apply trên kas_web_test, fixture giả rollback. | Còn fresh-schema CI/upgrade staging có quy trình; không coi DB vận hành đã cập nhật. |
| K23 | P2 | Làm một phần | TEMP/cache workaround và no-stock checks đã chạy được; build font/toolchain/full regression còn cần hoàn tất. | Môi trường tái lập, build thật, log exit code/passed/failed/skipped; không ignoreBuildErrors. |
| K24 | P1 | Chưa xác nhận phát hành | Chưa đủ evidence CI/staging/mail/storage/restore và manual booking E2E. | Release checklist có run/evidence/owner và PASS/FAIL/BLOCKED; không deploy tự động trong task này. |
| K25 | P1 | Frontend hồi quy đã qua | Mã mới typecheck và 77 files/1.426 tests pass; test cũ được đổi sang QR/xác minh tiền, owner context và URL. | Còn browser E2E và baseline backend architecture; không khôi phục stock/partner signup/key để chiều test lịch sử. |

## Checklist đánh dấu hoàn thành

Các ô bên dưới dành cho việc đóng toàn hạng mục; trạng thái đã làm một phần nằm trong bảng phía trên.

- [ ] K01 — Nghiệm thu website không tồn phòng
- [ ] K02 — Email outbox, retry và phục hồi
- [ ] K03 — Tách CMS khỏi hạ tầng web
- [ ] K04 — Lifecycle naming và baseline kiến trúc
- [ ] K05 — Lint toàn frontend và phạm vi rule
- [ ] K06 — Customer recovery hoàn chỉnh trong Next.js
- [ ] K07 — Password reset policy, abuse và transaction
- [ ] K08 — Alternative offer hợp lệ khi tạo và chấp nhận
- [ ] K09 — Queue báo phí hủy và quyết định khách
- [ ] K10 — Check-in, check-out và no-show
- [ ] K11 — Thống nhất transition sales và email
- [ ] K12 — Song ngữ và Money contract
- [ ] K13 — Proxy, CORS và PATCH
- [ ] K14 — Idempotency notification/token
- [ ] K15 — Site image slots: audit, version và truy vấn
- [ ] K16 — Hoàn thiện khoảng trống frontend/API quản trị
- [ ] K17 — Media và tài sản ảnh sau deployment
- [ ] K18 — Admin dùng chung, customer auth, RBAC/scope/PII
- [ ] K19 — Integration và browser E2E theo luồng mới
- [ ] K20 — Đồng bộ README, comment và tài liệu hiện tại
- [ ] K21 — Cleanup legacy, source không hoạt động và dependency
- [ ] K22 — Flyway và isolation database test
- [ ] K23 — Toolchain, build và test tái lập
- [ ] K24 — CI và release readiness
- [ ] K25 — Hồi quy snapshot mới và cô lập test

## Ma trận luồng cần chạy

Mỗi luồng cần happy path, validation, loading/empty/error, mất mạng, hết phiên, thiếu quyền, retry/double-click; VI/EN/mobile với màn áp dụng.

| Nhóm | Luồng hiện tại | Task |
|---|---|---|
| Customer auth | customer-register → email/password login → refresh → logout/revoke | K18, K25 |
| Customer recovery | forgot → mail → reset → login mới → phiên cũ bị thu hồi | K06, K07 |
| Staff auth | Một SUPER_ADMIN email/mật khẩu → cả hai console → refresh/logout; 5 lần sai khóa 15 phút; CUSTOMER cách ly | K18, K25 |
| Đường đã rút | partner self-registration/password recovery không được vô tình mở lại; register API cũ không có handler | K18, K21, K25 |
| Khám phá | home/intent → hotel list/filter → hotel detail; không hiển thị số phòng còn/hết | K01, K19 |
| Giá và request | ngày/loại phòng/số lượng yêu cầu → price estimate → guest/terms/consent → request → receipt/reload | K01, K11, K19 |
| Manual payment | hotel review → QR/instructions → guest report → hotel verify → confirmed | K02, K11, K14 |
| Alternative | propose → accept/reject → request mới → hotel mới review | K08, K11, K12 |
| Customer account | profile load/edit/save, stays/history theo owner | K18, K19 |
| Hủy | free cancel hoặc late request → staff fee → accept/decline/expire; không đọc/ghi stock | K01, K09 |
| Property/room | tạo/sửa VI/EN → completeness → review → publish; amenities/facilities/landmarks/experiences | K18, K19 |
| Policy/QR | draft/activate policy; hotel payment profile → snapshot email | K02, K12, K19 |
| Giá quản trị | day/base/rules/bulk → public estimate; không có stock calendar | K01, K19 |
| Media/CMS | signed URL → PUT → complete → link/cover/order → public images/guidebook | K15, K17 |
| Sales/ops | queue/assign/contact/notes/decline/cancel/win, list/detail và vòng đời lưu trú được duyệt | K10, K11, K18 |
| Conversations | inbox → thread/reply/template → reload/unread/pagination | K18, K19 |
| Reviews/loyalty | completed stay → review once → moderation/public; membership/points/expiry/voucher theo contract | K04, K16, K19 |
| Trip.com | người có quyền cập nhật quý thủ công → public reflect; không giả feed/scrape | K16, K24 |
| Release | DB test upgrade → build → health → role smoke → backup/restore/rollback | K22–K24 |

## Cách giao việc cho Claude

Dán prompt nền rồi một prompt Kxx. Thứ tự: K03/K04/K05/K25 để chốt baseline → K11 và K02/K14 → K01 E2E cùng K09/K19 → K06–K10, K12–K18 → K20–K24. Đây là thứ tự thực hiện tuần tự, không tự chạy nhiều tác nhân sửa cùng file.

K01 đã triển khai: chỉ nghiệm thu/hardening, không làm lại stock removal bằng cách thêm stock mới. K25 không còn là “sửa 5 frontend fail”; trọng tâm là hồi quy snapshot mới và isolation. Mỗi hạng mục chỉ đóng khi tiêu chí đã có evidence; dùng bảng trạng thái trên để tránh làm lại việc đã xong.

## Danh mục API

File thứ ba người dùng đã nhận: `KAS_API_INVENTORY_2026-10-24.md`; tên hiển thị là **Danh mục API và màn hình**. `KAS_API_CATALOG_2026-10-24.md` là bản đồng bộ cùng nội dung. Danh mục được tạo lại từ controller đang đăng ký và typed client, có request-pricing, API vận hành mới và ghi rõ key-login/partner signup đã rút. Không coi một string client legacy là endpoint backend còn hoạt động.

## Cập nhật Brevo và quốc tịch — 25/10/2026

Đã nối key/sender BREVO_* và template ID từ .env; email khách VN dùng VI, quốc gia khác/không có dùng EN, độc lập locale website. Luồng hiện có: welcome, nhận yêu cầu, QR, xác nhận, hủy đã hoàn tất, đề xuất và yêu cầu thay thế. Password reset gửi nội dung VI/EN theo quốc tịch, sau commit, link sang màn reset Next.js đã được chủ dự án cho phép.

Nghiệm thu tiếp: hộp thư thực tế; mẫu MEMBER_EMAIL_VERIFICATION_VI hiện Brevo trả 404; trigger verification/nâng hạng/hoàn tất kỳ nghỉ chưa đầy đủ, không đánh dấu đã có. Kiểm tra QR theo khách sạn, URL báo thanh toán trong paymentDescription, URL chấp nhận/từ chối đề xuất, và lỗi mail không đảo ngược quyết định đã lưu. Test network dùng sandbox-drop, không phải bằng chứng đã giao thư. Chi tiết: docs/verification/2026-10-25-admin-ui/BREVO_AND_TEST_WEB.md.


Cập nhật kiểm tra lại 25/10/2026 sau khi chủ dự án sửa ID: 18/18 template trong .env đều tồn tại và active. MEMBER_EMAIL_VERIFICATION_VI ID 9 đã trả HTTP 200 khi đọc và HTTP 201 khi thử sandbox-drop; lỗi 404 trước đó đã hết. Đã nạp lại backend trên kas_web_test. Việc ID hợp lệ không tự bổ sung trigger verification/nâng hạng/hoàn tất kỳ nghỉ còn thiếu; chưa thử giao thư tới hộp thư thật.

## Kiểm thử lại toàn bộ frontend — 25/10/2026

83 file / 1.449 frontend test PASS; TypeScript PASS; ESLint phạm vi customer/auth/admin PASS. ESLint toàn repo còn 18 lỗi và 58 cảnh báo, build bị chặn do không tải được Google Fonts. Backend reports ghi 197 unit tests, trong đó 3 lỗi và 1 error thuộc architecture guards/baseline module. `kas_web_test` hiện không chạy nên backend IT và authenticated browser E2E chưa được chạy lại. Đăng ký customer không tạo session, yêu cầu xác thực email; test riêng kiểm tra token một lần/hết hạn và chặn login trước khi xác thực. Chi tiết và các lỗi đã sửa: [báo cáo kiểm thử luồng](docs/verification/2026-10-25-full-flow/REPORT.md).
