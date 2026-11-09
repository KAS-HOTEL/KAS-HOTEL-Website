# KAS — Render Deployment Checklist (05/11/2026)

Cấu hình: [`render.yaml`](../../render.yaml). Hướng dẫn từng bước: [doc 156](../kas/156-production-render-setup.md). Báo cáo kiểm thử: [KAS-TEST-EXECUTION-REPORT.md](../qa/KAS-TEST-EXECUTION-REPORT.md).

Ký hiệu: ✅ đã kiểm chứng · ⚠️ cần làm/đang mở · ⛔ chặn go-live · ⬜ chưa kiểm được (cần môi trường Render).

## 1. Code và build

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Backend build Docker (Maven, Java 21, chạy user không phải root) | ✅ | `backend/Dockerfile`; `mvn verify` 235 UT + 902 IT đạt |
| Backend đọc `PORT` | ✅ | `server.port: ${PORT:8080}` → trên Render là cổng Render đặt (mặc định 10000) |
| Backend sau proxy (HTTPS) | ✅ | `forward-headers-strategy: framework` |
| Lỗi không lộ stack trace / message | ✅ | `include-stacktrace: never`, `include-message: never` |
| Health không lộ chi tiết cho ẩn danh | ✅ | `show-details: when-authorized` (base); dev mới `always` |
| Cookie `Secure` ở production | ✅ | chỉ profile dev tắt (`cookie-secure: false`) |
| Flyway chạy khi khởi động, không clean, không baseline | ✅ | `clean-disabled: true`, `baseline-on-migrate: false` |
| Graceful shutdown | ✅ | mặc định của Spring Boot 3.5 |
| Console Next.js build production | ✅ | `next build` đạt; `KAS_API_ORIGIN` đọc **lúc build** |
| Website `server.js` | ✅ | đọc `PORT`, bind `0.0.0.0` khi production, bắt buộc `KAS_API_ORIGIN` + `ADMIN_KEY`; báo lỗi khi không listen được (QA-008) |
| Không hardcode localhost trong production | ✅ | website: `js/api.js` dùng origin hiện tại khi không phải localhost; console: rewrite theo env |
| Không phụ thuộc đường dẫn Windows | ✅ | đường dẫn từ env (`UPLOAD_DIR`, `KAS_CONFIG_DIR`) |
| `.env` không commit | ✅ | `.gitignore`: `.env`, `.env.*`, `*.env` |
| Code lên repo GitHub mà Render đọc được | ⛔ | Render không đọc GitLab tự host; chưa chọn repo |

## 2. Dịch vụ và biến môi trường (Render dashboard)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Blueprint tạo `kas-postgres`, `kas-backend` (standard), `kas-website`, `kas-console` | ⬜ | `render.yaml`, `autoDeploy: false` |
| DB tên `kas_web_dev`, user `kas_web_app` | ✅ (cấu hình) | readiness bắt buộc đúng tên (KAS-001) |
| `KAS_DB_URL` dạng JDBC, host **Internal** | ⬜ | `jdbc:postgresql://<internal-host>:5432/kas_web_dev?currentSchema=kas` |
| `KAS_JWT_SIGNING_SECRET` | ⬜ | `openssl rand -base64 48` |
| `KAS_EMAIL_OUTBOX_ENCRYPTION_KEY` riêng (32 byte) | ⬜ | `openssl rand -base64 32`; tránh khoá suy ra từ JWT (KAS-005) |
| Email Brevo: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | ⬜ | key đã kiểm tra hợp lệ (05/11); key thiếu quyền đọc account/senders nhưng không ảnh hưởng gửi |
| Allowlist email bật lúc đầu | ✅ (cấu hình) | `KAS_EMAIL_REQUIRE_ALLOWLIST=true`; chỉ tắt khi chủ dự án duyệt |
| `KAS_BOOKING_OPERATIONS_EMAIL` | ⛔ | thiếu → email cho khách sạn `HOTEL_EMAIL_MISSING` (KAS-007) |
| `KAS_API_ORIGIN` (website + console) | ⬜ | `http://<kas-backend internal>:<PORT>`; console phải deploy lại sau khi đặt |
| `KAS_CONSOLE_URL=https://admin.kasluxuryhotel.com` (website) | ✅ (cấu hình) | |
| `ADMIN_KEY` mạnh cho admin cũ | ⬜ | |
| R2 (upload trực tiếp) | ⚠️ | để trống nếu chưa dùng; quyết định nguồn ảnh (KAS-013) |

## 3. Dữ liệu production (bắt buộc trước khi nhận booking)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Flyway V1–V47 chạy sạch trên DB trống | ✅ | audit 02/11 (48 migration trên DB trống) + `FlywayHistoryIT` |
| Owner settings: `SALES_FIRST_CONTACT_SLA`, `DIRECT_REQUEST_HOLD_DURATION`, `INVENTORY_HORIZON_MONTHS`, `MAX_ROOMS_PER_REQUEST`, `DEPOSIT_REQUIRED_TO_CONFIRM` | ⛔ | thiếu → tạo booking 422 `CONFIG_MISSING` (KAS-006). Giá trị là quyết định nghiệp vụ; tham khảo bản test: PT24H, PT24H, 24, 5, false |
| Payment profile / QR từng khách sạn | ⛔ | thiếu → khách sạn bấm "còn phòng" bị 422 (KAS-008) |
| Email từng khách sạn hoặc email operations | ⛔ | KAS-007 |
| Dữ liệu 8 khách sạn, phòng, giá đã duyệt | ⚠️ | `KAS_PRODUCT_DECISIONS_TO_CONFIRM.md` |
| Tài khoản ADMIN và SUPER_ADMIN production | ⬜ | chủ dự án tự chạy `SharedAdminAccountProvisioning` trỏ External URL |
| Ảnh/cấu hình website từ disk dịch vụ cũ | ⚠️ | chép `uploads/`, `kas-config/` sang disk `kas-website` (KAS-011) |
| Backup DB | ⚠️ | bật backup của Render Postgres; kiểm tra khôi phục thử |

## 4. Domain, HTTPS, mạng

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| `admin.kasluxuryhotel.com` → `kas-console` | ⬜ | CNAME tại Tenten theo giá trị Render hiển thị |
| `kasluxuryhotel.com`, `www` → `kas-website` khi cut-over | ⬜ | DNS đã trỏ Render; chỉ chuyển custom domain giữa 2 service |
| HTTPS do Render cấp | ⬜ | |
| CORS backend | ✅ | cho `kasluxuryhotel.com`, `www`; console và website gọi cùng origin nên không cần thêm |
| Backend không cần domain công khai | ✅ | website/console gọi qua mạng nội bộ |

## 5. Kiểm tra sau deploy (chạy lại được)

```bash
KAS_SITE=https://kas-website.onrender.com KAS_API=https://kas-website.onrender.com \
KAS_CONSOLE=https://admin.kasluxuryhotel.com KAS_EXPECT_PRODUCTION=1 \
node qa/smoke/kas-smoke.mjs
```

- Smoke 89 kiểm tra (đặt `KAS_EXPECT_PRODUCTION=1` để bắt health không lộ chi tiết, cookie `Secure`). Có thể đặt `KAS_QA_CUSTOMER_EMAIL/PASSWORD` của **một tài khoản test** trên production để kiểm tra phần đã đăng nhập; không dùng tài khoản khách thật.
- Kiểm tra tay: đăng nhập ADMIN và SUPER_ADMIN trên `admin.kasluxuryhotel.com`; khách và admin cùng lúc trên một trình duyệt.
- Log Render: dòng `Email delivery: dispatcher=on provider=brevo key=present … recipients=allowlist`.

## 6. Gate go-live cho khách

| Gate | Trạng thái |
|---|---|
| Không còn lỗi Critical | ✅ |
| Lỗi High: QA-001 đã sửa; KAS-013 (ảnh website ↔ admin) có phương án tạm: quản lý ảnh bằng admin cũ | ⚠️ chấp nhận tạm hoặc sửa |
| Luồng booking, auth, phân quyền | ✅ (IT + smoke + E2E-API) |
| Console bằng tài khoản staff | ⛔ BLOCKED — cần tài khoản staff test |
| Owner settings / QR / email khách sạn trên production | ⛔ |
| Điều khoản và chính sách no-show được duyệt | ⛔ |
| QA-004 (giới hạn số phòng/yêu cầu) được quyết định | ⚠️ |

**Kết luận:** có thể deploy Render ở chế độ nội bộ (allowlist bật, chưa chuyển domain chính) ngay khi có repo GitHub và secret; **chưa** mở cho khách cho tới khi các mục ⛔ hoàn tất.
