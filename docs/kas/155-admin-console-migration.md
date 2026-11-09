# Chuyển chức năng admin V22 sang Next.js

Ngày cập nhật: 24/10/2026. Tài liệu ghi nhận phạm vi triển khai và kiểm tra thực tế; không thay thế quyết định nghiệp vụ 152, 153, 154.

## Quyết định đã áp dụng

- **QD-A:** cho dán URL HTTPS; upload R2 vẫn được giữ khi có cấu hình. Ảnh URL dùng chung `media_asset` / `media_link`, không tạo hệ thống gallery khác.
- **QD-B:** giữ nguyên admin cũ và dữ liệu tại chỗ để đối chiếu ảnh, giá. Chưa xóa trang Node cũ.
- **QD-C:** chuyển ghi chú và log cũ vào `docs/legacy-frontend/`, có bảng kê đường dẫn.
- Website không có dữ liệu tồn phòng, giữ phòng hoặc tự trừ/hoàn tồn. Khách sạn kiểm tra thủ công bên ngoài website.
- Một tài khoản SUPER_ADMIN dùng chung bằng email/mật khẩu cho `/admin` và `/partner`, theo quyết định 154.

## Checklist triển khai

- [x] API nhân viên duyệt phòng/gửi QR, đề xuất phòng thay thế, xác nhận đã nhận tiền.
- [x] Dùng chung logic chuyển trạng thái với link email; vô hiệu hóa link cũ sau khi quyết định đã được ghi nhận.
- [x] Nút thao tác trong chi tiết yêu cầu đặt phòng. Đề xuất chọn tên khách sạn/hạng phòng công khai.
- [x] `PAYMENT_PENDING` mới có thao tác xác nhận tiền; bỏ nút chốt yêu cầu cũ khỏi màn chi tiết.
- [x] Route báo phí hủy chuyển vào `/api/v1/admin/ops/...`, có danh sách và form báo phí.
- [x] Đánh giá: duyệt/từ chối bài chờ, ẩn/hiện bài đã duyệt, xóa mềm có lý do. Giữ nội dung khách nguyên vẹn.
- [x] Voucher: danh sách, tìm/lọc, tạo mã với điều kiện và thay đổi trạng thái. Sửa lỗi PostgreSQL khi không truyền bộ lọc trạng thái.
- [x] Khách hàng: tìm kiếm, phân trang, chỉnh sửa thông tin liên hệ; điểm và hạng chỉ đọc.
- [x] Nhập điểm Trip.com theo quý ở chi tiết khách sạn admin.
- [x] Bản đồ section và thư viện nguồn ảnh chỉ đọc; Collection dùng danh sách khách sạn thực tế và ảnh bìa từ media.
- [x] Chính sách dùng chung: chọn khách sạn làm ngữ cảnh đối tác, quản lý bản nháp/nội dung hai ngôn ngữ/vòng đời qua hệ thống chính sách hiện có.
- [x] Gallery khách sạn và hạng phòng: thêm URL HTTPS với mô tả VI/EN, xuất bản qua cùng các điều kiện công khai hiện có.
- [x] Tài khoản GLOBAL dùng được thư viện ảnh và chọn chủ sở hữu cho upload R2; chính sách GLOBAL được thu hẹp theo khách sạn đã chọn.
- [x] Menu mới và kho lưu tài liệu cũ.

## Màn hình

| Đường dẫn | Công việc |
| --- | --- |
| `/partner/requests/[reference]` | Duyệt QR / đề xuất / xác nhận tiền |
| `/partner/cancellation-requests` | Danh sách chờ báo phí hủy |
| `/admin/reviews` | Duyệt và kiểm duyệt đánh giá |
| `/admin/vouchers` | Voucher |
| `/admin/customers` | Khách hàng thành viên |
| `/admin/properties/[propertyId]` | Chi tiết admin và điểm Trip.com |
| `/admin/content/map` | Bản đồ section từ danh mục slot |
| `/admin/content/sources` | Tham chiếu nguồn ảnh admin cũ |
| `/admin/collection` | Tổng hợp ảnh bìa khách sạn |
| `/partner/policies` | Chính sách dùng chung |

## API bổ sung hoặc điều chỉnh

| Phương thức / đường dẫn | Quyền |
| --- | --- |
| `POST /api/v1/admin/sales/requests/{reference}/approve-payment` | `sales.request.manage` |
| `POST /api/v1/admin/sales/requests/{reference}/propose-alternative` | `sales.request.manage` |
| `POST /api/v1/admin/sales/requests/{reference}/confirm-payment` | `reservation.win` |
| `GET /api/v1/admin/ops/reservations/cancellation-requests` | `reservation.cancel` |
| `POST /api/v1/admin/ops/reservations/cancellation-requests/{reference}/{requestId}/fee` | `reservation.cancel` |
| `POST /api/v1/admin/media/external` | `media.upload` và `media.publish` |
| `POST /api/v1/admin/media/upload-url?ownerType=...&ownerId=...` | `media.upload`, kiểm tra chủ sở hữu trong scope |
| `/api/v1/admin/policies?contextPropertyId=...` và các route con | `property.manage`, ngữ cảnh đối tác được suy ra từ khách sạn |
| `PATCH /api/v1/admin/reviews/{id}/moderation` | Thêm `APPROVE`, `REJECT`; `DELETE` vẫn cần `review.delete` |

URL ảnh: chỉ lưu tham chiếu HTTPS, không tải ảnh từ máy chủ ngoài về backend. Dùng cột `external_url` đã có từ V33; một asset chỉ có một nguồn (URL hoặc R2). Ảnh URL lặp lại trong cùng thư viện được tái sử dụng. Không có R2 vẫn xem được URL trong gallery/covers. Các điều kiện công khai asset/link/khách sạn/hạng phòng vẫn được kiểm tra.

## Triển khai và điều kiện vận hành

- Migration mới: `V42__review_moderation_decisions.sql` mở rộng hành động kiểm duyệt. Không sửa migration đã áp dụng trước đó.
- Migration được thử trên **kas_web_test**. Chưa áp dụng vào cơ sở dữ liệu vận hành.
- Gửi email thật vẫn cần Resend và địa chỉ gửi hợp lệ. Khi thiếu cấu hình, quyết định của nhân viên vẫn được ghi nhận; hệ thống không thực hiện yêu cầu mạng gửi thư. Không coi trạng thái đã lưu là bằng chứng email đã đến khách.
- Duyệt QR cần khách sạn đã cấu hình QR thanh toán. Thiếu QR trả `CONFIG_MISSING`, giữ nguyên trạng thái yêu cầu.
- Chưa thực hiện đối chiếu và nhập toàn bộ ảnh/giá từ admin V22; vì vậy admin cũ tiếp tục được giữ.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript toàn frontend | PASS |
| Lint 40 file source/test vừa sửa hoặc thêm | PASS, 0 lỗi, 0 cảnh báo |
| Frontend Vitest toàn bộ | **77 files / 1.426 tests PASS**, 0 failed |
| Integration `AdminOperationsIT` | **11 tests PASS**, 0 failures/errors/skipped |
| Integration R2 giả `MediaUploadIT` / `MediaCoversIT` | **21 + 8 tests PASS**, 0 failures/errors/skipped |
| Flyway V42 trên kas_web_test | Validate/apply PASS; không migrate DB vận hành |
| Production build | PASS, gồm TypeScript và tạo toàn bộ route; lần thử có mạng tải Google Fonts |
| Kiểm tra whitespace diff | PASS |

Log được lưu tại `docs/verification/2026-10-24-admin/`. Các fixture integration được rollback; Brevo được thay bằng mock, không gửi email thật. 11 test mới bao gồm: approve/confirm riêng và chống lặp, thiếu QR, đề xuất không tự confirm, từ chối người thiếu quyền, danh sách không bộ lọc, reject review và quyết định lặp, quote phí và lặp, policy GLOBAL có context, ảnh URL có điều kiện công khai/HTTPS, thứ tự quý Trip.com, lỗi voucher trùng/customer thiếu.

Lỗi phát hiện và sửa qua test: so sánh `sales_status` với varchar khi duyệt QR; bộ lọc nullable PostgreSQL; các từ chối hợp lệ của API admin bị `ResponseStatusException` chuyển thành 500 (đổi sang exception theo contract KAS); quý Trip.com cũ ghi đè điểm hiện tại. R2 và URL giữ cùng các gate công khai.

Chưa chứng nhận full lint legacy, toàn bộ backend unit/architecture, browser E2E, gửi Brevo thật, R2 thật hoặc staging/production. Các phần này vẫn được ghi trong 25 hạng mục/prompt để tiếp tục nghiệm thu. Không đánh dấu toàn dự án production-ready.

## Bổ sung 25/10/2026 — Trả lời yêu cầu và báo phí hủy

- Chi tiết yêu cầu: khối Trả lời yêu cầu đặt phòng nằm trước ghi chú. Hai nhánh rõ Còn phòng — xác nhận và gửi QR / Hết phòng — đề xuất phòng khác. Đề xuất có bước xem lại khách sạn, phòng, ngày, số lượng, giá và lời nhắn trước gửi. Xác nhận đã nhận tiền vẫn là thao tác riêng ở PAYMENT_PENDING.
- Yêu cầu hủy: chọn phần trăm tổng giá trị đặt phòng hoặc số tiền cụ thể. Hiển thị phí dự kiến theo tiền tệ, xem lại rồi xác nhận gửi. Form khóa khi gửi, lỗi giữ dữ liệu để thử lại.
- API nhận đúng một trong feeMinor/percentage. Server tính % trên tổng giá lưu trong reservation dưới khóa giao dịch, ROUND_HALF_UP về đơn vị nhỏ nhất; audit lưu loại phí, % và số tiền căn cứ. Báo phí không tự hủy booking.
- Giữ tương thích request feeMinor cũ. Không có migration/schema mới; không đụng tồn phòng.
- Đây là bổ sung vào hai màn VH03/VH06 đã có, không tăng tổng số URL màn hình. Các luồng còn thiếu khác trong checklist chưa thuộc lần triển khai này.
