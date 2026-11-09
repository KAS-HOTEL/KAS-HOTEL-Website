# KAS regression suite

Chạy lại sau mỗi lần sửa. Báo cáo: `docs/qa/`.

## 1. Backend (unit + integration, PostgreSQL thật)

```bash
cd backend
./mvnw -B verify
```

Cần biến `KAS_DB_PASSWORD` (lấy từ `.env`, không in ra) và DB `kas_web_test` trên 127.0.0.1:5433. Kết quả 05/11/2026: 235 unit + 902 integration, 0 lỗi.

## 2. Frontend (console Next.js)

```bash
cd frontend
npx vitest run
npx tsc --noEmit
npx eslint .
npx next build
```

`next build` chạy song song với `next dev` được (Next 16 ghi dev vào `.next/dev`).

## 3. Smoke live (`qa/smoke/kas-smoke.mjs`)

Node 18+, không cần cài gì. Mặc định **chỉ đọc**, không ghi dữ liệu, không làm backend xếp email.

```bash
node qa/smoke/kas-smoke.mjs
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `KAS_SITE` | `http://localhost:3001` | website HTML (`server.js`) |
| `KAS_API` | `http://localhost:8080` | backend (hoặc website, vì website proxy `/api/v1`) |
| `KAS_CONSOLE` | `http://localhost:3002` | console Next.js |
| `KAS_QA_CUSTOMER_EMAIL` / `KAS_QA_CUSTOMER_PASSWORD` | – | **tài khoản test** để chạy phần đã đăng nhập (lưu/bỏ lưu khách sạn được trả về trạng thái cũ) |
| `KAS_EXPECT_PRODUCTION=1` | – | thêm kiểm tra production (health không lộ chi tiết, cookie Secure) |
| `KAS_SMOKE_REPORT` | – | ghi kết quả JSON |

Tài khoản QA trên `kas_web_test` nằm trong `qa/smoke/.qa-accounts.env` (bị git ignore):

```bash
set -a; . qa/smoke/.qa-accounts.env; set +a
KAS_QA_CUSTOMER_EMAIL=$KAS_QA_CUSTOMER_A_EMAIL KAS_QA_CUSTOMER_PASSWORD=$KAS_QA_CUSTOMER_A_PASSWORD node qa/smoke/kas-smoke.mjs
```

Thoát mã 0 khi không có FAIL, 1 khi có.

## Lưu ý an toàn

- Backend chạy bằng `run-kas-local.ps1` đang ở **chế độ gửi email thật, không allowlist** (QA-015). Đừng tạo tài khoản/booking với email thật khi test tay trên backend đó.
- Các kịch bản có ghi dữ liệu (đặt phòng, huỷ) trong đợt QA 05/11 chạy trên một backend riêng tắt gửi email; không đưa vào smoke mặc định.
