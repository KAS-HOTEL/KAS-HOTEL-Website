# Báo cáo kiểm thử luồng website và quản trị — cập nhật đến 31/10/2026

## Tóm tắt hiện tại — 31/10/2026

- Sau khi gỡ mã không dùng: TypeScript PASS; ESLint 0 lỗi/60 cảnh báo; Vitest 86 file/1.419 test PASS; Next.js production build PASS; backend unit + architecture 202/202 PASS; integration `kas_web_test` 864 ca, 0 FAIL/0 ERROR/35 bỏ qua. Đây là kết quả đã ghi nhận trong lần chạy ngày 31/10, không phải kết quả chạy lại trong lượt cập nhật tài liệu này.
- Browser E2E đã kiểm tra luồng tài khoản HTML → Spring, nhưng dispatcher email bị tắt; chưa kiểm tra browser cho màn admin sau đăng nhập.
- Đối chiếu chỉ đọc database test `kas_web_test` ngày 31/10: có 3 email `PENDING`, không có `last_error_code`. Dispatcher được tắt trong lượt browser E2E. Đây là hàng đợi test local, không phải trạng thái production và không chứng minh email đã gửi.
- `.env` local có các biến Brevo API key/sender và 18 giá trị template ID không rỗng. Chỉ xác nhận biến có mặt; không kiểm tra giá trị, trạng thái xác thực sender, phản hồi Brevo hiện tại hoặc giao thư tới inbox. Không gửi email thật trong lần rà soát này.
- Kiểm tra lại TypeScript trong lượt cập nhật: PASS. Vitest không khởi chạy được do `EPERM` khi đổi tên tệp tạm, trước khi test chạy; lần chạy backend mục tiêu không hoàn tất. Vì vậy dùng kết quả đã ghi nhận ngày 31/10 ở trên, không đánh dấu lượt này là full verification.
- Chưa nghiệm thu Brevo bằng mailbox thật, staging/Render, R2 thật, backup/restore/rollback hoặc browser E2E admin đã đăng nhập.

Các phần lịch sử bên dưới được giữ để truy nguyên; khi có mâu thuẫn, ưu tiên trạng thái mới nhất trong mục **Rà soát toàn project — 31/10/2026** và phần cập nhật sau gỡ mã.

## Phạm vi

Đối chiếu frontend công khai, tài khoản khách và admin/partner với API/backend. Website công khai đang dùng HTML frontend; admin dùng Next.js. Các luồng được bao phủ bởi test component/unit gồm trang chủ, tìm khách sạn, chi tiết phòng, gửi yêu cầu đặt phòng, đăng ký/xác thực email, đăng nhập/đặt lại mật khẩu, hồ sơ/lưu trú khách, dashboard admin, quản lý khách sạn/phòng/giá/media/chính sách, yêu cầu đặt phòng và hủy, đánh giá/voucher/khách hàng, nội dung website và nhắn tin.

## Kết quả snapshot ban đầu — 25/10/2026 (lịch sử)

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend Vitest toàn bộ | **83 file / 1.449 test PASS**, 0 failed |
| TypeScript | PASS |
| ESLint phạm vi đăng ký, tài khoản, quản trị và nghiệp vụ vừa kiểm | PASS; 1 cảnh báo ảnh `<img>` trong PaymentProfileEditor |
| ESLint toàn frontend | 0 lỗi, còn 58 cảnh báo legacy/performance sau override phạm vi hẹp cho script CommonJS cũ và browser debounce. |
| Backend Surefire | XML hiện có 197 test: 3 FAIL, 1 ERROR. Các lỗi nằm ở architecture guard: `MeGuestReviewController.Stay.status`, web → security qua SiteImageSlotController, và baseline module còn thiếu customer/integration/review/voucher. |
| Production build | Không hoàn tất: môi trường không truy cập được Google Fonts (`fonts.googleapis.com`). |
| Browser E2E thực tế | Chưa chạy; bộ hiện có là Vitest và backend integration qua MockMvc, chưa phải trình duyệt thật. |

## Đăng ký và xác thực email — mô tả lịch sử 25/10/2026

Mục này mô tả luồng dùng liên kết xác thực trước khi chuyển sang mã. Từ migration V46 và cập nhật 31/10, luồng hiện dùng mã 6 chữ số; xem phần rà soát toàn project bên dưới.

- Frontend gửi `fullName`, email, điện thoại, quốc tịch, mật khẩu và locale tới `POST /api/v1/public/auth/customer-register`.
- Frontend không tạo session sau đăng ký; giao diện yêu cầu kiểm tra email trước khi đăng nhập.
- Backend ghi account/customer/membership, tạo token xác thực một lần, hạn 30 phút; email gửi sau commit. Login và refresh từ chối customer chưa xác thực. Mở link GET không xác thực; người dùng phải xác nhận trên trang.
- Test frontend xác nhận đăng ký không tự đăng nhập, quốc tịch gửi độc lập locale, xác nhận link chỉ khi người dùng bấm, gửi lại dùng phản hồi chung, token hết hạn báo lỗi. Test backend: `CustomerEmailVerificationIT` 4 PASS, `AuthenticationIT` 22 PASS, `AdminOperationsIT` hiện 20 PASS; các test dùng database riêng, rollback và Brevo mock.
- Không thử gửi thư tới hộp thư thật. Tài liệu Brevo trước đó ghi sandbox-drop được chấp nhận; đây không phải bằng chứng giao thư thật.

## Cập nhật xử lý theo phương án — 26/10/2026

- Đã thêm transactional outbox trong module `shared` hiện có, không tạo module hay thay cấu trúc project. Migration `V44__transactional_email_outbox.sql` lưu payload email đã mã hóa AES-GCM; `event_key` duy nhất chống enqueue trùng. Dispatcher gửi theo batch, lease xử lý, retry lũy tiến tối đa 5 lần; lỗi cuối lưu mã lỗi tổng quát và xóa payload nhạy cảm.
- Đăng ký/xác thực email, reset mật khẩu và các thông báo booking được xếp hàng trong cùng transaction với thay đổi nghiệp vụ. Reset email có cooldown 1 phút; token vẫn dùng một lần, hết hạn sau 30 phút và reset thu hồi session hiện có.
- Admin/partner chi tiết yêu cầu booking có endpoint và phần hiển thị tình trạng giao email riêng khỏi trạng thái quyết định booking. Các trạng thái gồm chờ gửi, đang gửi, thử lại, đã gửi và lỗi cuối.
- Kiểm tra mới: backend main compile PASS; test compile PASS; `EmailOutboxCipherTest` 3/3 PASS; TypeScript PASS; ESLint cho phần trạng thái email PASS. Các integration test booking/email đã chuyển sang kiểm tra payload outbox đã giải mã trong môi trường test, nhưng chưa chạy được vì PostgreSQL test chưa sẵn sàng.
- Chưa xác minh migration trên database staging, gửi email tới hộp thư kiểm thử, backup/restore/rollback hoặc smoke test staging. Cần cấu hình staging thật, khóa mã hóa outbox ổn định và hộp thư nhận test trước khi thực hiện các bước đó. Không thêm Docker hay thay đổi cách chạy hiện tại.

## Cập nhật kiểm thử tích hợp local — 26/10/2026

- Dùng Docker Compose/PostgreSQL đã có trong project. Container `kas-postgres` healthy, database tách riêng `kas_web_test`; migration dry-run cho thấy chỉ có V44 chờ, sau đó áp dụng thành công lên v44. Không chạy migration trên `kas_web_dev`.
- Integration PASS sau cập nhật: `CustomerEmailVerificationIT` 4/4, `BookingEmailLanguageIT` 9/9, `AdminOperationsIT` 21/21 (email-deliveries, site image audit/concurrency, stay transitions và cấu hình cutoff), `AuthenticationIT` 22/22. Migration runner và outbox cipher/dispatcher tests cũng PASS.
- Full backend verification chưa PASS: unit/architecture 198 tests có 3 failures và 1 error; các guard đã ghi nhận trước đó vẫn báo `MeGuestReviewController.Stay.status` và phụ thuộc module `web` tới security. Full Failsafe chạy 855 tests, có 205 failures và 40 errors. Nổi bật: `FlywayHistoryIT` còn kỳ vọng baseline migration cũ (34 migrations/53 bảng), `ReservationRequestPersistenceIT` chưa cập nhật danh sách constraint, một số suite quyền trả 403 thay vì kết quả kỳ vọng, và `ReservationConcurrencyIT` còn phụ thuộc bean `HoldExpiryService` đã bị deprecate/loại khỏi context. Đây là việc cần phân loại và xử lý riêng; không coi toàn bộ suite là xanh.
- `.env` có dòng văn bản ghi thông tin tài khoản không phải cú pháp dotenv, khiến `docker compose` tự động đọc file thất bại. Database có sẵn vẫn chạy và được truy cập trực tiếp cho các test; file `.env` không bị sửa.
- Bổ sung test retry provider rejection, crash/lease recovery trong database, enqueue idempotency, reset-password cooldown, delivery trong admin, actor role và stale-write guard cho site image slots. Lần chạy mục tiêu mới: `EmailOutboxCipherTest` + `EmailOutboxDispatcherTest` 5/5 PASS; `BookingEmailLanguageIT` 9/9 PASS; `StayTransitionServiceTest` PASS; `AdminOperationsIT` 21/21 PASS.
- ESLint theo toàn frontend sau khi thêm override đúng phạm vi cho CommonJS CLI/server cũ và browser debounce: 0 lỗi, còn 58 cảnh báo legacy/performance. TypeScript PASS; Vitest toàn bộ 83 file / 1.449 test PASS.

## Lỗi phát hiện và xử lý

1. Test gửi lại email tìm nhãn `Email` chính xác nhưng giao diện có dấu bắt buộc `*`; truy vấn test được đổi sang regex khớp nhãn thật. Đây là lỗi test, không phải lỗi gửi email.
2. Trang lưu trú khách bắt lỗi API trong cùng khối `try/catch` với JSX. Đã tách fetch và render để fallback bắt đúng lỗi tải dữ liệu, tránh dựa vào `try/catch` để bắt lỗi render.

## Kết luận tại 25/10/2026 (đã được cập nhật bên dưới)

Các test frontend hiện chạy xanh; đăng ký khách đã theo đúng yêu cầu xác thực email và được kiểm tra ở mức component/API integration. Chưa xác nhận đầy đủ luồng trên trình duyệt với backend hoạt động. Cần chạy lại backend IT và browser E2E khi `kas_web_test` hoạt động; cần xác nhận thư xác thực đến hộp thư thử nghiệm trước khi nghiệm thu phát hành. Các lỗi architecture và lint legacy chưa chứng minh lỗi nghiệp vụ runtime nhưng vẫn chặn trạng thái toàn repo xanh.

## Tổng hợp risk và phương án

Mức risk phản ánh ảnh hưởng nếu lỗi xảy ra và độ thiếu bằng chứng hiện tại. “Chưa xác minh” không có nghĩa là đã tái hiện lỗi runtime.

### Rất cao — xử lý trước khi mở production

| Hạng mục | Risk | Phương án |
| --- | --- | --- |
| K02, K14 — email giao dịch và tính lặp | Quyết định đặt phòng/hủy có thể đã commit nhưng email thất bại hoặc bị gửi lặp; trạng thái UI và khách có thể lệch nhau. | Thêm outbox có trạng thái delivery, retry có quyền và idempotency key bền vững ở DB; UI phân biệt “đã lưu quyết định” với “đã gửi email”. Test crash sau commit, provider timeout, retry/replay và race giữa admin với link email. |
| K01, K08, K09, K11, K19 — vòng đời đặt phòng, phương án thay thế và hủy | Đây là luồng tiền/booking cốt lõi. Thiếu E2E hoặc race guard có thể xác nhận sai yêu cầu, áp phí sai hoặc xử lý hai lần. | Dùng test DB rollback và trình duyệt kiểm tra từ request → khách sạn duyệt thủ công → QR → khách báo chuyển khoản → khách sạn xác minh → xác nhận; phủ accept/reject/hết hạn/phát lại/race cho offer và cancellation. Giữ tuyệt đối quy tắc không quản lý tồn phòng. |
| K18, K06, K07 — đăng nhập, xác thực email và khôi phục tài khoản | Bỏ qua xác thực hoặc lỗi reset/refresh có thể làm mất quyền sở hữu tài khoản hay giữ session cũ. Luồng đăng ký hiện đã chặn login trước xác thực theo code/test. | Chạy browser E2E VI/EN: đăng ký → mail xác thực → link một lần/hết hạn → login; reset → token hết hạn/dùng lại → session cũ bị thu hồi. Rà soát rate limit, cooldown, token concurrency và xác nhận gửi mail thật tới hộp thư test. |
| K17, K22, K24 — tài sản, migration và phát hành | R2/Brevo thật, upgrade schema và backup/restore chưa được chứng minh; build hiện bị chặn khi tải font. | Chạy pipeline staging với storage/mail test, fresh DB và upgrade DB riêng, validate migration, backup/restore/rollback và smoke test; đóng gói/self-host font để build không phụ thuộc mạng lúc build. Không migrate DB production trong bước kiểm thử. |

### Cao — cần đóng hoặc có quyết định phạm vi trước phát hành

| Hạng mục | Risk | Phương án |
| --- | --- | --- |
| K10 — check-in/check-out/no-show | Đã có API quản trị với scope, row lock, transaction, kiểm tra trạng thái, audit/history và ngày địa phương. Cutoff A5 được chốt 23:59 `Asia/Ho_Chi_Minh`; charge và chính sách giải phóng tồn vẫn thuộc OQ-045 và ngoài phạm vi. Chưa có browser E2E. | Tích hợp 21/21 gồm check-in → check-out, chặn check-in lặp/trước ngày, chặn no-show khi thiếu config và xác nhận cấu hình `23:59`. Unit test kiểm tra trước ngày/giờ bị chặn, từ 23:59 ngày check-in cho phép, ngày sau vẫn cho phép. Migration V45 đã áp dụng trên `kas_web_test`; cần áp dụng và smoke test trên staging trước production. Không tự đặt phí hoặc stock. |
| K12 — ngôn ngữ và Money | Nội dung mail/action chưa nhất quán VI/EN và một số hiển thị có thể dùng sai đơn vị tiền. | Chuẩn hoá locale từ quốc tịch/snapshot, dùng Money/exponent chuẩn hoặc khóa rõ VND; test số tiền có số lẻ, phần trăm làm tròn, VI/EN và XSS. |
| K13 — proxy/CORS/PATCH | Cross-origin có thể không gửi được một số thao tác PATCH hoặc cookie/CSRF nếu deployment khác origin. | Chốt kiến trúc same-origin hay cross-origin; đồng bộ CORS method/header/credentials với proxy và chạy test preflight, cookie, CSRF theo domain staging. Không dùng wildcard credentials. |
| K16, K25 — nghiệm thu toàn màn admin và hồi quy | 1.449 test component PASS nhưng chưa xác nhận thao tác thực tế, quyền, trạng thái lỗi và dữ liệu thật trong trình duyệt. | Dùng checklist 37 URL; chạy role/scope matrix cho SUPER_ADMIN, partner context và customer; kiểm tra loading/empty/error/forbidden, VI/EN và mobile. Ưu tiên request, cancellation, property publish, media, policy, reviews, vouchers và customer. |

### Trung bình — đóng baseline kỹ thuật trước khi coi CI xanh

| Hạng mục | Risk | Phương án |
| --- | --- | --- |
| K03, K04 và backend architecture tests | Hiện có 3 FAIL/1 ERROR trong architecture guards; module boundary và tên lifecycle không khớp baseline. | Chuyển SiteImageSlotController khỏi dependency vòng `web → security` qua contract ở `shared`; đổi `Stay.status` thành tên lifecycle cụ thể; cập nhật module baseline có review, rồi chạy lại Surefire và IT. |
| K05 và ESLint | Full lint còn 18 lỗi/58 cảnh báo; phạm vi code nghiệp vụ vừa kiểm đã lint sạch. | Tách config Next.js khỏi HTML/Node legacy hoặc khai báo override theo thư mục; sửa lỗi thật trong `server.js`; không tắt rule toàn repo. Theo dõi giảm lỗi theo file. |
| K15 — site image slots | Đã lấy role từ actor, đọc slot theo key và cập nhật compare-and-set để chặn stale write. Test audit role và xung đột stale-write PASS. | Đã xử lý backend và test. Còn architecture guard `web → security`; chỉ đổi module baseline sau khi xác nhận ranh giới mong muốn. |
| K20, K21 — tài liệu và legacy | Tài liệu lịch sử hoặc source cũ có thể gây nhầm flow đang dùng; chưa cần dọn code cũ trước khi có consumer map. | Gắn nhãn tài liệu legacy, rà README/comment theo consumer map; chỉ xóa HTML/Node/assets sau khi xác nhận không còn route/deployment tham chiếu. |
| K23 — build/test tái lập | Frontend build phụ thuộc Google Fonts; full verify chưa xanh do môi trường mạng và architecture baseline. | Self-host font; ghi rõ toolchain/DB profile; CI chạy typecheck, lint theo scope, toàn frontend test, backend unit/IT, build và log kết quả. |

## Thứ tự triển khai đề xuất

1. Áp dụng V45 trên staging và chạy E2E check-in/check-out/no-show trước, đúng và sau cutoff, gồm race/replay.
2. Chạy browser E2E public booking + xác thực email + admin/partner theo checklist; dùng mailbox test và R2 test/fake, không dùng production data.
3. Đóng architecture guards, lint scope và font/build để pipeline xanh, sau đó kiểm migration/backup trên staging.
4. Hoàn tất Money/locale, CORS, self-host font và architecture baseline; xác nhận site-image audit đã có test quyền/concurrency.

## Đối chiếu kết nối Frontend–Backend — 26/10/2026

### Kết luận

**Chưa nối hết.** Frontend sản phẩm là Next.js trong `frontend/src`; API client tập trung ở `frontend/src/lib/api/client.ts`, và `frontend/next.config.ts` proxy cùng origin `/api/v1/*` tới Spring theo `KAS_API_ORIGIN`. Nhiều luồng public, tài khoản, booking, partner và admin đã có API module/screen tương ứng, nhưng còn các phần thiếu dưới đây. Đây là rà soát mã nguồn và hợp đồng, không phải browser E2E.

### Đã nối ở Next.js

| Luồng | Bằng chứng trong frontend |
| --- | --- |
| Catalog/chi tiết khách sạn, phòng, chính sách, tiện ích, giá báo trước, quote, gửi yêu cầu và biên nhận | `publicHotels.ts`, `reservations.ts`, `features/hotel/*`; backend public property, request-pricing, reservation routes tương ứng. |
| Đăng ký khách, xác thực email, gửi lại xác thực, đăng nhập/đăng xuất, đổi mật khẩu qua token và session | `auth.ts`, `CustomerAccountForm`, `CustomerEmailVerificationForm`, `CustomerPasswordResetForm`; registration chờ xác thực và không tạo session. |
| Hồ sơ, lưu trú và yêu cầu/quyết định hủy của khách | `customerProfile.ts`, `customerStays.ts`, trang `/{locale}/account/stays`. |
| Partner/admin property, room type, rates, policies, facilities, landmarks, experiences, media, sales queue, cancellation queue, conversations/templates | Các module endpoint riêng và màn hình dùng trong app Partner/Admin. Upload signed URL có code path nhưng phụ thuộc cấu hình storage. |
| Review moderation, voucher, customer admin và nhập điểm Trip.com | `adminTools.ts` cùng màn hình admin tương ứng. |
| Đọc danh sách/chi tiết reservation vận hành | `opsReservations.ts` ↔ `OpsReservationController` GET. |

### Còn thiếu hoặc chỉ nối một phần

| Mức | Hạng mục | Phát hiện |
| --- | --- | --- |
| Cao | Quên mật khẩu | Backend có `POST /api/v1/public/auth/forgot-password`, nhưng `auth.ts` không có hàm gọi và Next.js không có form để yêu cầu email reset. Form đổi mật khẩu chỉ hoạt động khi đã có token. |
| Cao | Check-in/check-out/no-show | Backend đã có ba POST route, nhưng `opsReservations.ts` chỉ GET list/detail và `ReservationDetailView` không có thao tác. Frontend admin hiện không thể gọi các transition vừa thêm. |
| Trung bình | Khách gửi review và xem review public | Backend có `POST /api/v1/me/reviews` và `GET /api/v1/public/reviews`; frontend hiện mới có màn admin duyệt review, chưa có luồng guest/public. |
| Trung bình | Đánh giá Trip.com trên trang public | Admin có thể ghi rating, nhưng frontend không gọi `GET /api/v1/public/trip-ratings`; rating public chưa được xác nhận là hiển thị từ nguồn backend. |
| Thấp/phạm vi sản phẩm | Trang địa điểm/bản đồ | Backend có `GET /api/v1/public/locations`, nhưng Next.js chưa có endpoint wrapper hoặc trang tiêu thụ. |
| Runtime legacy / production | Repo có `frontend/server.js` và một package JSON cũ gọi Node, nhưng cấu hình deploy hiện tại trong repo không khởi chạy file này. Netlify loại `server.js` khỏi artifact; Docker dùng package Next.js. Tài liệu test ghi nhận server.js từng chạy local ở cổng 3000, không chứng minh production. Cần kiểm tra project/command trên hosting để xác nhận tiến trình production thực tế. |
| Dọn mã | Đăng ký Partner legacy | `authApi.register` và `RegisterForm` vẫn gọi `/api/v1/public/auth/register` đã bị rút; route `/partner/register` hiện trả not-found và component không được sử dụng. Không phải luồng đang chạy nhưng là endpoint chết còn trong code. |

### Cơ chế kết nối và giới hạn xác minh

- Next.js dùng API client có cookie, CSRF, refresh và lỗi chuẩn; proxy chỉ cấu hình `/api/v1/*`. Các route legacy `/api/catalog`, `/api/admin/*` không đi qua proxy này.
- Static review xác nhận nhiều đường dẫn/method khớp controller tương ứng; chưa gửi toàn bộ danh sách request qua browser và chưa xác minh runtime frontend gọi đúng host/deployment.
- Việc đóng các gap cần bổ sung: API client + UI quên mật khẩu; API client + thao tác UI cho stay transitions; quyết định sản phẩm cho review public/guest và location/rating; quyết định chuyển đổi hoặc ngừng legacy Node. Chưa sửa các gap trong lượt kiểm tra này.

### Xác minh riêng `frontend/server.js` trong cấu hình production — 26/10/2026

- `frontend/package.json` hiện đặt `start` là `next start`; không chạy `node server.js`. `frontend/Dockerfile` kết thúc bằng `CMD ["npm","start"]`, nên theo package hiện tại Docker cũng không gọi `server.js`. Dockerfile này còn không chạy `npm run build`, vì vậy cần kiểm tra riêng tính khả dụng của cấu hình Render trước khi dùng nó làm bằng chứng deploy thành công.
- `frontend/package (2).json` là file phụ, không phải manifest npm mặc định; script của file này gọi `node server.js` nhưng Dockerfile/Render không đổi tên nó thành `package.json`.
- `frontend/netlify.toml` build static rồi xóa `server.js`, `Dockerfile` và `render.yaml`; `frontend/vercel.json` cấu hình build/output static. Hai cấu hình này không chạy Express server.
- `frontend/render.yaml` không còn tự tạo service. Blueprint ở repo root được chuẩn bị để chạy cả website HTML cũ bằng `node server.js`, Next.js console và Spring Boot; việc này chưa được đồng bộ lên Render.
- Trong runtime Node của website, build dùng manifest/lock cũ có Express/Multer; Next.js service dùng manifest/lock Next.js riêng. Route `/api/v1/*` trên Express được proxy cùng origin tới Spring, còn `/api/catalog` và `/api/admin/*` vẫn là API legacy đọc/ghi dữ liệu JSON và ảnh.
- **Chưa xác nhận tiến trình production thực tế** vì chưa có quyền vào Render project hoặc domain settings. Cấu hình trong repo chỉ cho biết điều gì sẽ chạy sau khi Blueprint được kết nối và deploy.

### Chạy thử topology website → Spring Boot — 26/10/2026

- Giữ nguyên UI HTML đang được phục vụ bởi `frontend/server.js`; các file gốc khớp mẫu `^[a-z0-9-]+\.html$` được phục vụ bằng URL sạch, `/` trỏ `index.html`. Tập hiện tại gồm `about`, `admin`, `after-dark-guide[-vi]`, `booking-confirmed`, `city-guide[-vi]`, `city-guide-home`, `city-guidebook[-vi]`, `experiences`, `find-your-kas`, `guest-details`, `hotel-detail`, `hotels`, `manage-booking`, `offers`, `reference`, `review-confirm`, `room-detail`, `saved-hotels`, `support`, `verify-email` và trang chủ. Không có trang đăng ký Partner riêng trong HTML cũ.
- Các trang HTML dùng `frontend/js/api.js` gọi `/api/v1/*`; đã thêm proxy server-side tới `KAS_API_ORIGIN`, chuyển tiếp cookie/session, CSRF và phản hồi để browser vẫn cùng origin. `/actuator/health/*` cũng được proxy vì legacy client dùng `/actuator/health/db` để lấy cookie CSRF trước lệnh ghi. `/api/catalog` và các `/api/admin/*` của giao diện/admin cũ chưa chuyển sang Spring; chúng tiếp tục dùng JSON trong source và thư mục dữ liệu cấu hình/upload riêng. Blueprint gắn persistent disk vào website để giữ các ghi legacy qua lần deploy.
- Blueprint Render root có ba dịch vụ: backend Spring Boot dùng Dockerfile hiện có; website HTML dùng `server.js`; console Next.js giữ cho admin/partner hiện đại. Website và console dùng cùng `KAS_API_ORIGIN`; email verification/reset trỏ về website HTML.
- Kiểm tra local: website `/` trả 200; `/actuator/health/db` qua website trả 200 và đặt cookie `XSRF-TOKEN`; API công khai `/api/v1/public/site-image-slots` qua proxy trả 200 JSON; profile cá nhân không có session trả 401 từ Spring như mong đợi; `/actuator/health` trả `UP`; Next.js `/admin/login` trả 200. Spring chạy profiles `dev,web-test` trên 8080 và Flyway xác nhận `kas_web_test` ở V45. Outbox email được tắt trong phiên local này.
- Build production Next.js hoàn tất với self-host Be Vietnam Pro/Source Serif 4, không tải Google Fonts. `.next` cũ bị quyền workspace chặn ghi, vì vậy build kiểm chứng dùng `NEXT_DIST_DIR=.next-render-check`; cấu hình mặc định production vẫn dùng `.next`.
- **Chưa deploy lên Render.** Workspace không có phiên Render/hosting để liên kết Blueprint hoặc kiểm tra trạng thái live. Cần điền biến bí mật `KAS_DB_URL`, DB user/password, JWT, email/Brevo, R2, `ADMIN_KEY`, xác nhận hostname khả dụng và chọn cấu hình lưu trữ/plan trước khi đồng bộ Blueprint. Không thực hiện migration trên production trong lượt này.

## Rà soát toàn project — 31/10/2026

Kết quả tại thời điểm này thay thế các con số 1.449 test / 3 FAIL / 205 failures ở trên.

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend TypeScript | PASS |
| Frontend ESLint | 0 lỗi, 60 cảnh báo |
| Frontend Vitest | 86 file / 1.467 test PASS |
| Next.js production build | PASS |
| Backend unit + architecture | 202/202 PASS |
| Backend integration (`kas_web_test`) | 864 ca: 0 FAIL, 0 ERROR, 35 bỏ qua |
| Trình duyệt thật, HTML → Spring trên `kas_web_test`, dispatcher email tắt | PASS: đăng ký, sai mã, email trùng, đăng nhập khi chưa xác thực, nhập mã, dùng lại mã, quên mật khẩu, link email, đặt lại, thu hồi phiên, customer bị 403 ở API admin |

35 ca bỏ qua gồm 23 ca `@Disabled` của hành vi tồn phòng/giữ chỗ đã rút theo quyết định 153 và 12 ca (`PublicAmenityIT`, `seedPropertiesAreNotPublic`) cần catalogue public trống, không chạy được khi `kas_web_test` có 8 khách sạn đã publish cho test thủ công.

Lỗi đã sửa: `verify-email.html` còn gửi token cũ; form đăng ký Next.js kẹt ở bước nhập mã; link email trỏ tới route không có trên website HTML; `availability-check` trả 500 do sai dạng JSON; race idempotency trả 500 vì `@Transactional` đặt ở controller; no-show không thể thực hiện từ `CONFIRMED`; proxy Express treo với body `{}`; `api.js` lặp vô hạn khi thiếu cookie CSRF; đăng ký đồng thời trả 500; CORS thiếu PATCH; mã xác thực phụ thuộc hoa/thường và có thể đụng `token_hash`. Bổ sung Next.js quên mật khẩu và nút nhận/trả phòng/không đến. Hai lỗi kiến trúc K03/K04 và baseline module đã đóng: site image chuyển sang module `media`.

Chưa kiểm chứng: gửi thư tới hộp thư thật, R2 thật, staging/Render, backup/restore. Chưa chạy trình duyệt cho các màn admin khi đã đăng nhập.

### Cập nhật sau khi gỡ mã không dùng — 31/10/2026

Đã gỡ `RegisterForm`, `PhoneField`, `StepIndicator`, `WinRequestPanel`, `authApi.register`, `salesRequestsApi.win` và backend `PartnerRegistrationService`, `PropertySlug`, `RegistrationRequest`, `RegistrationView`. Endpoint backend `POST /admin/sales/requests/{reference}/win` vẫn giữ. Test của component còn dùng chuyển sang `authForms.test.tsx` và `requestDetail.test.tsx`.

Kết quả chạy lại: TypeScript PASS; ESLint 0 lỗi, 60 cảnh báo; Vitest 86 file / 1.419 test PASS (giảm 48 test của phần đã gỡ); Next.js build PASS; backend unit 202/202 PASS; backend integration 864 ca, 0 FAIL, 0 ERROR, 35 bỏ qua.

### Đối chiếu email Brevo/outbox — 31/10/2026

- Xác thực đăng ký hiện tạo mã 6 chữ số và xếp email inline vào outbox; luồng này không phụ thuộc `MEMBER_EMAIL_VERIFICATION` template ID. Các template link xác thực trong ghi chú 25/10 là lịch sử, không phải bằng chứng cấu hình luồng mã hiện tại.
- Email booking dùng các template VI/EN cho `BOOKING_REQUEST_RECEIVED`, `BOOKING_AVAILABILITY_PAYMENT`, `BOOKING_CONFIRMED`, `ALTERNATIVE_STAY_SUGGESTION`, `BOOKING_CANCELLED`; thông báo vận hành khách sạn có email inline. Email welcome dùng `MEMBER_WELCOME`. Mã nguồn có retry và trạng thái delivery; API 2xx của Brevo chỉ xác nhận provider nhận yêu cầu, không xác nhận email vào inbox.
- Kiểm tra `.env` chỉ xác nhận tên biến API key/sender và 18 template ID có giá trị không rỗng. Không đọc/ghi giá trị secrets, không xác minh key, sender/domain, template đang hoạt động hay khả năng giao thư hiện tại. Blueprint Render khai báo các biến template booking/welcome; chưa có bằng chứng các giá trị đã được nhập trên Render.
- `KAS_EMAIL_OUTBOX_ENABLED` không có trong `.env` local; cấu hình ứng dụng mặc định là bật nếu tiến trình không override. Riêng lần browser E2E trong báo cáo, dispatcher được tắt có chủ đích. Không dùng kết quả E2E này để kết luận Brevo runtime đang hoạt động.
- Truy vấn tổng hợp chỉ đọc `kas_web_test` cho thấy 3 bản ghi `PENDING`, không có mã lỗi. Không đọc người nhận hoặc payload, không gửi/đẩy lại các bản ghi này. Cần rà người nhận và tuổi email test trước khi bật dispatcher; mã xác thực/reset cũ có thể hết hạn trước khi gửi.
- Chưa có xác nhận giao thư vào mailbox thật. Việc xác nhận cần thực hiện ở staging với mailbox kiểm thử, allowlist người nhận và kiểm tra đồng thời trạng thái outbox cùng inbox/spam.

### Việc còn lại theo ưu tiên

1. **P0 — Gửi thư thật có kiểm soát:** cấu hình staging với Brevo/sender đã xác minh; bật dispatcher có chủ đích, bật allowlist chỉ cho mailbox test; kiểm thử email mã xác thực và từng sự kiện booking VI/EN; ghi nhận outbox chuyển trạng thái và thư thực sự tới mailbox. Không bật gửi unrestricted trên môi trường test.
2. **P0 — Staging/Render và dữ liệu:** chưa deploy/kiểm tra Render; cần xác nhận biến môi trường, migration đến V46, health, backup/restore/rollback và smoke test. Không suy ra trạng thái production từ `kas_web_test`.
3. **P1 — R2 và nghiệm thu quản trị:** cấu hình storage test, kiểm tra upload thật; browser E2E bằng tài khoản đã đăng nhập cho admin/partner và ma trận role/scope.
4. **P1 — Dữ liệu/chính sách:** xác minh dữ liệu khách sạn, phòng, giá, quyền ảnh và điều khoản VI/EN; cutoff no-show 23:59 đã cấu hình nhưng không thay thế chính sách phí/điều khoản do đơn vị vận hành duyệt.
5. **P2 — Phạm vi sản phẩm:** tiếp tục giữ nguyên quyết định không quản lý tồn phòng. Portfolio search theo khả năng còn phòng chỉ triển khai nếu chủ sản phẩm chốt yêu cầu mới. Chưa thấy trigger email cho nâng hạng thành viên hoặc hoàn tất kỳ nghỉ; xác nhận nhu cầu trước khi bổ sung.

### Ghi chú chạy kiểm tra khi cập nhật báo cáo — 31/10/2026

- `npm run typecheck`: PASS.
- Vitest ba bộ test tài khoản/xác thực/reset không khởi chạy được trong môi trường hiện tại: tiến trình dừng ở lỗi Windows `EPERM` khi đổi tên thư mục tạm, chưa chạy test và chưa có kết quả pass/fail của các assertion.
- Backend test mục tiêu Brevo/outbox không hoàn tất trong lượt này; không dùng lần chạy bị ngắt làm kết quả. Các con số backend 202/202 và 864 integration ở trên là kết quả chạy được ghi nhận trước đó trong ngày 31/10.
