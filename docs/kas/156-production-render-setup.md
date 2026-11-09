# 156 — Production trên Render, console ở admin.kasluxuryhotel.com (05/11/2026)

Quyết định của chủ dự án ngày 05/11/2026: dựng production riêng trên Render (không dùng server webdemo). Console Admin/Partner chạy ở host riêng `admin.kasluxuryhotel.com`. Cấu hình nằm trong [`render.yaml`](../../render.yaml).

## Kiến trúc

| Địa chỉ | Dịch vụ Render | Vai trò |
|---|---|---|
| `kasluxuryhotel.com`, `www` | `kas-website` | Website HTML + `server.js`, chuyển `/api/v1` sang backend |
| `admin.kasluxuryhotel.com` | `kas-console` | Console Next.js (`/admin`, `/partner`), chuyển `/api/v1` sang backend |
| (không có domain công khai) | `kas-backend` | Spring Boot API |
| | `kas-postgres` | PostgreSQL, DB `kas_web_dev`, user `kas_web_app` |

**Vì sao console ở host riêng.** Cookie phiên (`kas_access`, `kas_refresh`) gắn với host. Khi console và website khác host, trình duyệt giữ hai phiên riêng: nhân viên và khách đăng nhập được trên cùng một máy, và một lỗi trên website công khai (XSS, script bên thứ ba) không gửi được request kèm phiên nhân viên. Website tìm địa chỉ console qua `KAS_CONSOLE_URL` → `/site-config.json` để hiện mục "Trang quản trị".

**Tên DB `kas_web_dev`.** Readiness probe (`DatabaseSchemaHealthIndicator`) bắt buộc đúng tên DB và user này. Đổi tên cho production là một thay đổi code riêng.

## Điều kiện trước khi mở cho khách

Hạ tầng có thể dựng trước, nhưng các mục sau vẫn đang mở (xem `KAS_PRODUCT_DECISIONS_TO_CONFIRM.md`):

- Điều khoản và chính sách no-show chưa được duyệt. Theo quyết định hiện hành, chưa bật luồng đặt phòng production.
- Dữ liệu thật của 8 khách sạn (phòng, giá, ảnh có quyền sử dụng) chưa được xác nhận.
- Email bắt đầu với **allowlist bật** (`KAS_EMAIL_REQUIRE_ALLOWLIST=true`): chỉ gửi tới các địa chỉ trong `KAS_EMAIL_ALLOWED_RECIPIENTS`. Chỉ đổi thành `false` khi chủ dự án duyệt gửi email thật cho khách.

## Các bước

### 0. Đưa code lên repo mà Render đọc được
Render chỉ build từ GitHub, GitLab.com hoặc Bitbucket, nên không đọc được GitLab tự host (`202.143.110.25`). Cần một repo GitHub cho mã này (ví dụ trong tổ chức `KAS-HOTEL`). Website hiện tại build từ `KAS-HOTEL/KAS-HOTEL-Website` và giữ nguyên tới bước cut-over.

### 1. Tạo Blueprint
Render → **New → Blueprint** → chọn repo → Render đọc `render.yaml` và tạo `kas-postgres`, `kas-backend`, `kas-website`, `kas-console`. Khi đó các dịch vụ chạy ở địa chỉ `*.onrender.com`; domain thật chưa đổi.

### 2. Nhập secret (các mục `sync: false`)

| Biến | Dịch vụ | Giá trị |
|---|---|---|
| `KAS_DB_URL` | backend | `jdbc:postgresql://<Internal hostname của kas-postgres>:5432/kas_web_dev?currentSchema=kas` |
| `KAS_JWT_SIGNING_SECRET` | backend | chuỗi ngẫu nhiên dài: `openssl rand -base64 48` |
| `KAS_EMAIL_OUTBOX_ENCRYPTION_KEY` | backend | `openssl rand -base64 32` (đúng 32 byte) |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | backend | key Brevo; địa chỉ gửi thuộc domain đã xác thực trên Brevo (`kasluxuryhotel.com` đã có `brevo1/brevo2._domainkey`). Không khai báo `BREVO_TEMPLATE_*` thì dùng template trong repo. Trước khi bật, kiểm tra trong Brevo rằng tài khoản gửi đã hoạt động lại (ngày 25/10 Brevo từng khoá gửi mà vẫn trả 2xx). |
| `KAS_EMAIL_ALLOWED_RECIPIENTS` | backend | địa chỉ test do chủ dự án chỉ định |
| `KAS_BOOKING_OPERATIONS_EMAIL` | backend | email nhận thông báo đặt phòng (để trống thì thông báo khách sạn ghi `HOTEL_EMAIL_MISSING`) |
| `KAS_R2_*`, `KAS_MEDIA_DELIVERY_BASE_URL` | backend | để trống nếu chưa bật upload trực tiếp |
| `KAS_API_ORIGIN` | website, console | địa chỉ private của `kas-backend` (tab Connect → Internal), ví dụ `http://kas-backend-xxxx:10000`. Backend lắng nghe `${PORT:8080}` và Render đặt `PORT` (mặc định 10000), nên dùng đúng cổng Render hiển thị |
| `ADMIN_KEY` | website | khoá mạnh cho công cụ ảnh cũ `/admin.html` |

Console đọc `KAS_API_ORIGIN` lúc **build**, nên sau khi nhập phải deploy lại console.

### 3. Database và tài khoản quản trị
- Lần khởi động đầu tiên, Flyway tạo schema `kas` và chạy toàn bộ migration (V1–V47).
- Tạo tài khoản Admin / Super Admin: chủ dự án tự chạy `devsetup/SharedAdminAccountProvisioning` (đặt `KAS_ADMIN_EMAIL`, `KAS_ADMIN_PASSWORD` ≥16 ký tự, `KAS_ADMIN_ROLE`) trỏ tới **External URL** của `kas-postgres`. Không ai khác giữ mật khẩu.
- Kiểm tra `https://<kas-backend>.onrender.com/actuator/health` báo `UP`.

### 4. DNS cho console (Tenten, domain `kasluxuryhotel.com`)
1. Trên Render, `kas-console` → Settings → Custom Domains đã có sẵn `admin.kasluxuryhotel.com` (lấy từ blueprint). Render hiện giá trị đích.
2. Trên Tenten, thêm bản ghi: **CNAME**, tên `admin`, giá trị `<tên kas-console>.onrender.com` (lấy đúng giá trị Render hiện).
3. Bấm Verify trên Render và chờ Render cấp chứng chỉ HTTPS.

Bản ghi `@` (A `216.24.57.1`) và `www` hiện đã trỏ vào Render nên **không cần sửa**.

### 5. Kiểm tra trước cut-over
- Trên `kas-website.onrender.com`: trang chủ, danh sách khách sạn, đăng ký/đăng nhập khách (email chỉ tới địa chỉ trong allowlist).
- Trên `admin.kasluxuryhotel.com`: đăng nhập Admin và Super Admin, mỗi tài khoản chỉ thấy menu của mình.
- Cùng một trình duyệt: đăng nhập khách trên website và admin trên console, cả hai phiên vẫn giữ sau khi tải lại trang.

### 6. Cut-over website
1. Sao chép ảnh và cấu hình website (`uploads/`, `kas-config/`) từ disk của dịch vụ đang chạy `kas-hotel-collection` sang disk `kas-website` (`/var/data`), dùng Render Shell hoặc `scp` qua SSH của Render.
1b. Chuyển ảnh đang hiển thị trên website sang thư viện ảnh của console (một lần, chạy lại an toàn):
   `node tools/migrate-legacy-images-to-console.mjs --api https://admin.kasluxuryhotel.com --site https://kasluxuryhotel.com` (xem trước), rồi thêm `--apply` và đăng nhập tài khoản ADMIN. Thêm `--skip-external` nếu không muốn đưa ảnh hotlink bên thứ ba (tripcdn, unsplash…) vào console. Từ đó website ưu tiên ảnh console; khách sạn/phòng chưa có ảnh trên console vẫn dùng ảnh cũ.
1c. Admin cũ (`/admin.html`, `/api/admin/*`) đã **đóng** mặc định. Chỉ mở lại tạm thời bằng `KAS_LEGACY_ADMIN_ENABLED=true` trên `kas-website` nếu cần lấy lại dữ liệu cũ. Upload ảnh mới từ console cần R2 (`KAS_R2_*`, `KAS_MEDIA_DELIVERY_BASE_URL`); slot ảnh website (`/admin/content/images`) nhận URL nên dùng được ngay.
2. Gỡ `kasluxuryhotel.com` và `www.kasluxuryhotel.com` khỏi `kas-hotel-collection`, rồi thêm vào `kas-website`. DNS giữ nguyên.
3. Kiểm tra lại mục 5 trên domain thật.

**Rollback:** chuyển hai domain về lại `kas-hotel-collection`. Dịch vụ cũ vẫn chạy cho tới khi chắc chắn mới tắt.

## Webdemo

Webdemo (`webdemo.kasbookingapp.com`) vẫn là môi trường test. Cấu hình console ở host riêng cho webdemo (`webdemo-admin.kasbookingapp.com`) đã soạn trong `deploy-webdemo/` (ngoài repo) và chờ bản ghi DNS trên Cloudflare.
