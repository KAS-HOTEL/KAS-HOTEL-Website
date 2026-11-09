# KAS Hotel Admin — báo cáo nâng cấp UX, quy trình và dữ liệu

Ngày: 03/11/2026 · Thư mục: `Kas_Web_Full` · Chưa commit, chưa deploy.

## 1. Nguyên nhân từng lỗi

| Vấn đề | Nguyên nhân |
|---|---|
| Avatar không đổi trên thanh điều hướng | Ảnh chưa từng được lưu ở server, chỉ lưu trong `localStorage` của trình duyệt với một key dùng chung cho mọi tài khoản. Header chỉ vẽ chữ cái đầu và không vẽ lại khi menu đã hiện. |
| Yêu cầu 25 ngày không chuyển quá hạn, không có thông báo | Trạng thái `EXPIRED` có trong DB nhưng đoạn code duy nhất ghi trạng thái này (HoldExpiry) đã ngừng chạy. Không có job nào kiểm tra `sla_due_at`. Bảng `notification` không được dùng. Yêu cầu tạo khi khách chấp nhận phương án thay thế không có `sla_due_at`, nên không bao giờ quá hạn. |
| Layout nhảy khi bấm Khách hàng / Voucher | Trang `/admin/*` dùng shell dạng `compact` (sidebar 232px, cố định). Trang `/partner/*` dùng shell mặc định (264px, cuộn theo trang). Menu Super Admin trỏ sang cả hai nhóm trang. |
| Quá nhiều bộ lọc trùng | Tab + dropdown trạng thái + nguồn khách + checkbox quá hạn. Không có API đếm số lượng. |
| Voucher | Mã do nhân viên tự gõ. "Quyền lợi thêm" là loại `VALUE_ADD`, không được phần đặt phòng nào sử dụng. |

## 2. Thay đổi

**Backend**
- `SalesRequestExpiryService` + `SalesRequestExpiryScheduler` (chạy mỗi phút):
  - Yêu cầu `REQUESTED`, `ASSIGNED`, `AVAILABILITY_CHECK` quá `sla_due_at` chuyển sang `EXPIRED`.
  - Ghi lịch sử với actor `SYSTEM`, lý do `SLA_EXPIRED`.
  - Gửi 1 email cho khách sạn qua outbox (khóa `sales-request-expired-{mã}`, không gửi trùng).
  - Không đụng tới yêu cầu đã chấp nhận, đã hủy, đã từ chối, đã liên hệ hoặc đã đề xuất phương án khác.
  - Idempotent: dùng `SKIP LOCKED` và kiểm tra lại trạng thái trước khi cập nhật.
- Thời hạn chỉ lấy từ một nguồn là `SALES_FIRST_CONTACT_SLA` → `reservation.sla_due_at`, không hardcode. Yêu cầu tạo từ phương án thay thế giờ cũng có `sla_due_at`.
- `GET /api/v1/admin/sales/requests?queue=awaiting|expired|accepted` và `GET /api/v1/admin/sales/requests/counts?property=` (đếm trong DB, theo phạm vi quyền).
- Voucher: server tự sinh mã `KAS-XXXXXXXX` (ngẫu nhiên, duy nhất, tự sinh lại nếu trùng). Không nhận mã gõ tay. Không tạo mới loại `VALUE_ADD` (voucher cũ vẫn hiển thị).
- Avatar: migration **V47** `customer_avatar` (rollback: `DROP TABLE customer_avatar;`).
  - Endpoint `PUT/GET/DELETE /api/v1/me/profile/avatar` (JPEG/PNG/WebP ≤ 512 KB, kiểm tra chữ ký file).
  - Profile trả về `avatarUrl` kèm `?v=` để chống cache.
- Danh sách khách hàng admin có thêm `customerCode`, `accountStatus`, `avatarUrl`, và endpoint `/api/v1/admin/customers/{id}/avatar`.

**Frontend admin (Next.js)**
- Một shell dùng chung cho `/admin` và `/partner`:
  - Sidebar 232px cố định, chỉ vùng menu cuộn, nút đăng xuất ở cuối.
  - Card giữ padding riêng.
  - Bảng không làm tràn ngang trang.
- Menu Super Admin: Tổng quan / Vận hành (Yêu cầu đặt phòng, Đặt phòng & khách lưu trú, Yêu cầu hủy, Tin nhắn) / Khách hàng (Danh sách khách hàng) / Ưu đãi (Voucher).
- Yêu cầu đặt phòng:
  - 4 tab Tất cả / Chờ phản hồi / Quá hạn / Đã chấp nhận, kèm số lượng.
  - Chỉ còn bộ lọc Khách sạn; lựa chọn được giữ khi chuyển tab.
  - Cột: Mã, Khách hàng, Khách sạn, Nhận – trả phòng, Phòng/khách, Giá trị, Thời hạn phản hồi, Trạng thái, Xem.
  - Bấm vào hàng để mở chi tiết.
  - Trang chi tiết có ngày tạo, thời hạn, thời gian còn lại hoặc số thời gian quá hạn, và trạng thái.
- Đặt phòng & khách lưu trú: tab Đã xác nhận / Sắp nhận phòng (7 ngày, giờ VN) / Đang lưu trú / Đã trả phòng / Không đến / Đã hủy.
- Khách hàng:
  - Bảng gồm mã KH, ảnh, họ tên, email, SĐT, ngày đăng ký, trạng thái tài khoản.
  - Trang chi tiết `/admin/customers/[id]` dùng cùng layout và có nút sửa.
- Voucher:
  - Bảng danh sách.
  - Form gồm tên, loại giảm, giá trị, đơn tối thiểu, ngày bắt đầu/kết thúc, số lượng phát hành, giới hạn mỗi khách, trạng thái.
  - Hiển thị mã do server tạo.
- Vai trò không đọc được → báo "Chưa xác định được quyền truy cập", không hiện menu.

**Website khách**: lưu ảnh lên server. Header đổi ngay sau khi lưu, ảnh vẫn giữ sau khi tải lại, và xóa bản lưu cũ trong `localStorage`.

## 3. Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Backend unit | 234/234 |
| Backend integration | 897 chạy, 0 lỗi, 35 bỏ qua (test cần biến môi trường riêng) |
| Test mới | `SalesRequestExpiryIT` (quá hạn đúng 1 lần, không động vào đơn đã chấp nhận/hủy, tab và số lượng, phân quyền); avatar trong `CustomerEmailVerificationIT`; voucher và khách hàng trong `AdminOperationsIT` |
| Frontend Vitest | 1391/1391 (các test kiểm giao diện cũ đã viết lại theo yêu cầu mới) |
| Typecheck / ESLint | sạch, 0 lỗi (60 cảnh báo có sẵn từ trước) |
| `next build` | thành công |
| Trình duyệt (Playwright, 1440 và 1366) | sidebar giữ nguyên vị trí và kích thước ở mọi trang, không có thanh cuộn ngang; bộ quét tự chuyển 1 yêu cầu quá hạn sang Quá hạn trong ~1 phút; giữ khách sạn khi đổi tab; bấm hàng mở chi tiết; tạo voucher ra mã `KAS-…`; avatar đổi ngay trên header và giữ sau khi tải lại |

Kiểm tra trên trình duyệt chạy trên database thử với một tài khoản Super Admin test tạo riêng cho việc này. Backend trên máy local đã được khởi động lại và V47 đã chạy trên `kas_web_test`.

## 4. Chưa làm / giới hạn
- **Sửa voucher:** chưa có API sửa voucher, mới chỉ đổi được trạng thái.
- **Voucher theo khách sạn:** chưa có trường "khách sạn áp dụng" vì schema chưa hỗ trợ.
- **Thông báo trong hệ thống:** chưa làm vì hệ thống chưa có; thay bằng email cho khách sạn qua outbox. Khách đặt phòng không nhận được email khi yêu cầu quá hạn.
- **Lịch sử đặt phòng của khách:** là link tra cứu theo email trong màn Đặt phòng, chưa lọc theo mã khách hàng.
- **Danh sách yêu cầu:** chưa phân trang, vì backend vẫn chưa có (số lượng tab đếm chính xác trong DB).
- **Nguồn khách:** chỉ ẩn khỏi giao diện; dữ liệu và API vẫn giữ nguyên.
- **Màn hình ADMIN (khách sạn, nội dung website):** chỉ được hưởng phần shell và card dùng chung, chưa thiết kế lại từng màn.

## 5. Đăng nhập Admin
- URL: `/admin/login` (Admin và Super Admin) và `/partner/login` (cùng form). Khách hàng dùng chung endpoint đăng nhập nhưng không có quyền admin, nên `/api/v1/admin/**` trả **403** và `/admin` báo "không có quyền quản trị".
- Tạo hoặc cập nhật tài khoản quản trị (không có tài khoản mặc định, không hardcode):
  `KAS_ADMIN_EMAIL=... KAS_ADMIN_PASSWORD=<≥16 ký tự> [KAS_ADMIN_ROLE=ADMIN] [KAS_ADMIN_DATABASE=kas_web_test] ./mvnw test -Dtest=SharedAdminAccountProvisioning`
  Mặc định tạo SUPER_ADMIN trên `kas_web_dev`. Không chạy lệnh này lên production khi chưa có quy trình được duyệt.

## 6. Rủi ro khi deploy
- Lần quét đầu tiên trên production sẽ chuyển **mọi** yêu cầu chưa trả lời đã quá hạn (kể cả yêu cầu 25 ngày) sang Quá hạn và gửi cho mỗi yêu cầu 1 email báo khách sạn.
- Migration V47 chỉ thêm bảng mới.
- Client cũ gửi `code` khi tạo voucher sẽ nhận 400.
- Nhãn trạng thái lưu trú đổi: "Đã đặt / Khách đã tới / Khách không tới" thành 5 nhóm mới. Link bookmark cũ dạng `?status=booked|arrived` sẽ không còn lọc nữa.
