# KAS — Audit: Dev Tools, lối vào Admin, phiên đăng nhập, dọn file (03/11/2026)

Đã chép vào `Kas_Web_Full` (đối chiếu checksum khớp). Chưa commit, chưa deploy. Không có migration, không đổi schema, không đổi thời hạn token.

## Hệ thống (đã xác định trước khi sửa)

| Phần | Công nghệ / vị trí |
|---|---|
| Website khách | HTML + JS thuần (`frontend/*.html`, `js/`), Express `server.js` (cổng 3001), có admin ảnh cũ `admin.html` (`/admin` trên 3001, khoá bằng `ADMIN_KEY`) |
| Console Admin/Partner | Next.js 16 (`frontend/src`, `npm run dev -- -p 3002`), route `/admin/*`, `/partner/*` |
| Backend | Spring Boot 3.5 / Java 21, PostgreSQL (Flyway), cookie HttpOnly `kas_access` (15 phút) + `kas_refresh` (path `/api/v1/public/auth`, xoay vòng mỗi lần refresh) |
| Vai trò | Backend tự đọc từ DB (`app_user` + role assignment), không tin role từ client. `GET /api/v1/me/console` trả `SUPER_ADMIN` / `ADMIN` / `NONE` |
| Thời hạn phiên | access 15 phút; refresh khách 30 ngày, nhân viên 12 giờ (tuyệt đối, tính từ lúc đăng nhập) |

## A. Nguyên nhân

1. **Menu Dev Tools** (Route / Bundler / Route Info / Preferences, biểu tượng N): đây là Development Indicator của Next.js, chỉ có khi chạy `next dev`; bản build production không có.
2. **Không thấy lối vào Admin:** console là một ứng dụng riêng ở cổng 3002 (`/admin/login`, `/partner/login`), website 3001 không có link nào tới đó. Ngoài ra, nếu Super Admin đăng nhập trên website thì `GET /api/v1/me/profile` ném `ResponseStatusException(404)`; lỗi này không được bộ xử lý lỗi chung xử lý nên thành **500**, khiến website báo "lỗi máy chủ".
3. **Bị đăng xuất quá nhanh:**
   - **Console (Super Admin):** trang render phía server. Sau 15 phút cookie `kas_access` hết hạn và trình duyệt xoá nó. Cookie `kas_refresh` chỉ gửi tới `/api/v1/public/auth`, nên server không gia hạn được và chuyển thẳng về trang đăng nhập, dù phiên 12 giờ vẫn còn hiệu lực.
   - **Website (khách):** nhiều request cùng gặp 401 lúc access hết hạn (profile, favorites, stays), mỗi request tự gọi refresh. Backend xoay refresh token nên lần refresh thứ hai với token cũ bị từ chối, và website coi đó là "đã đăng xuất".
4. **File dư thừa:** có các bản sao Windows "(2)" (`package (2).json`, `package-lock (2).json`, `.env (2).example`) là cấu hình của website cũ, cùng một trang mồ côi `city-guide-home.html`. Chúng còn lại sau các lần gộp website cũ với Next.js.

## B. File đã chỉnh sửa

| File | Thay đổi |
|---|---|
| `frontend/next.config.ts` | `devIndicators: false` (cấu hình chính thức của Next 16). Overlay lỗi vẫn còn. |
| `frontend/src/proxy.ts` (mới) | Truyền đường dẫn đang mở (`x-kas-path`) cho server, chỉ áp dụng cho `/admin/*` và `/partner/*`. Không quyết định quyền truy cập. |
| `frontend/src/lib/auth/guard.ts` | Khi hết phiên, chuyển về đăng nhập với `returnTo` là đúng trang đang mở (trước đây luôn về trang chủ console). |
| `frontend/src/features/auth/SessionKeepAlive.tsx` (mới) | Gia hạn phiên mỗi 10 phút khi tab đang hiển thị, và ngay khi quay lại tab đã ngủ. Dùng chung cơ chế refresh một-lần (single-flight). Gia hạn thất bại thì không tự đăng xuất. |
| `frontend/src/features/auth/SessionRenewal.tsx` (mới) | Ở trang đăng nhập (khi bị chuyển tới với `returnTo`): thử gia hạn im lặng một lần. Thành công thì quay lại đúng trang; thất bại thì hiện form kèm thông báo "Phiên đăng nhập đã hết hạn". Có chặn lặp 15 giây. |
| `frontend/src/app/{admin,partner}/login/page.tsx` | Bọc form đăng nhập bằng `SessionRenewal`. |
| `frontend/src/app/{admin,partner}/(protected)/layout.tsx` | Thêm `SessionKeepAlive`. |
| `frontend/src/features/auth/SignInForm.module.css` | Kiểu cho dòng "Đang khôi phục phiên…" và thông báo hết phiên. |
| `frontend/js/api.js` | Website: một lần refresh dùng chung cho mọi request cùng gặp 401. Mỗi request được lặp lại đúng một lần, kể cả khi refresh của tab này thua một tab khác. Không lặp vô hạn. |
| `frontend/js/app.js` | Tài khoản nhân viên đăng nhập trên website (không có hồ sơ khách) được nhận diện qua `GET /api/v1/me/console`. Menu tài khoản có mục **"Trang quản trị"**: Super Admin tới `/partner`, Admin tới `/admin`. Khách hàng không thấy mục này. URL console lấy từ `window.KAS_CONSOLE_URL`; khi chạy local mặc định là `http://localhost:3002`. |
| `frontend/css/components.css` | Kiểu cho mục "Trang quản trị". |
| `backend/.../web/GlobalExceptionHandler.java` | `ResponseStatusException` giữ đúng mã HTTP (400/401/403/404/409) thay vì thành 500. |
| Test | `sessionLifecycle.test.tsx` (mới), `legacyAuth.test.ts` (+2: refresh dùng chung, không lặp), `GlobalExceptionHandlerTest` (+1). |

Cũng trong lượt này (mục 10): bỏ nút "Lưu để xem sau" ở trang phòng (`room-detail.html`, `css/components.css`, `js/app.js`, `js/storage.js`). Chỉ còn lưu khách sạn.

## C. File đã xoá

**Không xoá file nào.** Các file nghi dư thừa đều chưa đủ an toàn để tự xoá:

| File | Lý do chưa xoá |
|---|---|
| `frontend/package (2).json`, `frontend/package-lock (2).json` | Là cấu hình của website cũ (`node server.js`, express/multer). `Dockerfile` dùng `COPY package*.json`, nên glob này cũng khớp các file đó và chúng liên quan tới đóng gói. Cần anh/chị xác nhận cách deploy website trước. |
| `frontend/.env (2).example` | Mô tả `ADMIN_KEY`/`PORT` của `server.js`, khác `.env.example` (của Next). Nên gộp vào tài liệu chứ không xoá thẳng. |
| `frontend/city-guide-home.html` | Không trang nào link tới, nhưng vẫn được kê trong `ADMIN_IMAGE_SOURCE_INVENTORY.json` (image inventory: không được xoá). |
| `frontend/admin.html`, `js/admin.js` (admin ảnh cũ) | Vẫn đang dùng: ảnh website và gallery được upload qua đây (`/api/admin/*` của `server.js`). |
| Các file `KAS_*.md` ở gốc repo | Tài liệu, không ảnh hưởng chạy. Có thể chuyển vào `docs/` nếu muốn. |

## D. Authentication — vòng đời phiên sau khi sửa

- **Access token** 15 phút; **refresh token** khách 30 ngày, nhân viên 12 giờ (giữ nguyên, có xoay vòng, logout thu hồi phiên phía server).
- **Console:** trong 12 giờ, nếu còn dùng, phiên được gia hạn ngầm. Mở lại sau thời gian dài thì gia hạn im lặng và quay lại đúng trang. Chỉ yêu cầu đăng nhập lại khi refresh token hết hạn, bị thu hồi, hoặc người dùng tự đăng xuất; khi đó có thông báo rõ ràng.
- **Website:** 401 khiến website refresh đúng một lần dùng chung rồi lặp lại request. Lỗi mạng hoặc lỗi server không xoá phiên.
- **Nhiều tab:** cookie dùng chung, nên tab nào gia hạn thì các tab khác cũng được hưởng. Tab thua cuộc đua refresh vẫn lặp lại request bằng cookie mới.
- **Không có idle timeout riêng:** mức tối đa là thời hạn tuyệt đối của refresh token. Nếu muốn chặt hơn cho Super Admin (ví dụ 8 giờ), chỉ cần đổi `kas.auth.staff-refresh-ttl`.

## E. Cấu trúc project

Không di chuyển file hàng loạt, vì có rủi ro vỡ import, route và đường dẫn ảnh. Cấu trúc hiện tại đã tách rõ: `backend/` (module theo domain trong `com.kas.platform.*`, migration Flyway), `frontend/src/{app,features,lib,ui}` (console Next.js), `frontend/*.html` + `js/` + `css/` (website), `docs/`.

## F. Kết quả kiểm thử (đã chạy thật)

| Kiểm tra | Kết quả |
|---|---|
| Backend `mvn verify` | 236 unit + 901 IT, 0 lỗi. `AdminOperationsIT` lỗi lần đầu do DB test sandbox còn 27 email chờ gửi từ các đơn tôi đặt thử; dọn xong chạy lại thì pass. |
| Frontend Vitest | 91 file, 1412 test pass |
| `tsc`, ESLint | pass (2 cảnh báo có sẵn) |
| `next build` | pass, có `ƒ Proxy (Middleware)` |
| Dev indicator | badge bị ẩn (`display:none`) |
| Super Admin trên website | đăng nhập, menu có "Trang quản trị → http://localhost:3002/partner"; giữ sau khi tải lại trang |
| Khách hàng | menu bình thường, không có mục quản trị; gọi `/api/v1/admin/*` bị **403**; mở `/admin` hay `/partner/requests` đều hiện "Tài khoản này không có quyền quản trị" |
| Console hết access token | mở `/partner/requests`, gia hạn im lặng, quay lại đúng `/partner/requests` |
| Console hết hẳn phiên | về `/partner/login?returnTo=/partner/requests` kèm thông báo hết phiên |
| Website refresh đồng thời | 3 request cùng 401 chỉ gây 1 lần refresh, cả 3 thành công |

## G. Chưa làm / lưu ý

- **Production:** cần đặt `window.KAS_CONSOLE_URL` (địa chỉ console thật) cho website, nếu không mục "Trang quản trị" sẽ không hiện ngoài localhost.
- **Xoá file:** danh sách ở mục C chờ anh/chị quyết.
- **Chạy local:** cần khởi động lại console (vì `next.config.ts` và `proxy.ts` mới) và backend (vì bộ xử lý lỗi mới).
