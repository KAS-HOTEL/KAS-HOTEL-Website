# Test web và email Brevo — 25/10/2026

## Runtime

- Website: http://127.0.0.1:3010 ; admin: /admin/login ; backend: 127.0.0.1:8080.
- Backend chạy profiles dev,web-test; database kas_web_test, role kas_web_app, schema kas. Cấu hình application-web-test.yml và kiểm tra readiness nhận đúng database, không bỏ kiểm tra role/schema.
- Database test có 8 khách sạn, 48 hạng phòng. Tài khoản admin dùng chung đã được người dùng cho phép sao chép riêng từ dev sang test, giữ nguyên mật khẩu; không sao chép khách hàng, booking hoặc session.
- Không chạy reset/clean database. Các test integration tự rollback.

## Cấu hình và ngôn ngữ

- Khởi động runtime đọc BREVO_* từ .env. application.yml nhận BREVO_API_KEY / BREVO_SENDER_EMAIL / BREVO_SENDER_NAME, vẫn tương thích tên KAS_BREVO_* cũ.
- BrevoEmailClient lấy ID từ BREVO_TEMPLATE_<SỰ_KIỆN>_VI/EN. Không nhúng API key hoặc ID thật vào source.
- Country VN, không phân biệt hoa/thường, chọn VI. Các quốc gia khác và quốc tịch chưa có chọn EN. Không dùng locale trang web để suy ra quốc tịch.
- Snapshot guest_country được giữ trong các bước thanh toán/đề xuất/yêu cầu thay thế. Quốc tịch khách hàng được lưu khi đăng ký; cả form Next.js và modal HTML cũ đã có lựa chọn quốc tịch.
- Các email khách đang nối: MEMBER_WELCOME, BOOKING_REQUEST_RECEIVED, BOOKING_AVAILABILITY_PAYMENT, BOOKING_CONFIRMED, BOOKING_CANCELLED, ALTERNATIVE_STAY_SUGGESTION. Thông báo vận hành gửi khách sạn dùng VI. Email đặt lại mật khẩu dùng HTML VI/EN vì .env không có mẫu reset mật khẩu.
- Email hủy chỉ gửi khi đã hủy thực sự; báo phí và khách chưa đồng ý không kích hoạt xác nhận hủy.
- Mẫu QR hiện không có biến nút báo đã thanh toán. URL báo chuyển khoản được đưa đầy đủ vào paymentDescription; paymentReportUrl cũng được truyền để sẵn sàng gắn nút mẫu sau. Đề xuất giữ URL chấp nhận trong availabilityUrl và URL từ chối trong nội dung alternativeBranch/rejectUrl.
- Backend chỉ có QR URL và hướng dẫn chuyển khoản; không bịa tên ngân hàng, số tài khoản hoặc hạn thanh toán. Các trường tương ứng hướng khách xem QR/liên hệ khách sạn.

## Mẫu chưa khả dụng / luồng chưa có

- Brevo API xác nhận key mới hoạt động và 17 template active; BREVO_TEMPLATE_MEMBER_EMAIL_VERIFICATION_VI hiện trả 404. Không tự đổi ID hoặc sửa template từ xa.
- Chưa có đủ luồng email verification / nâng hạng / hoàn tất kỳ nghỉ; không tự phát sinh các sự kiện này chỉ vì .env có ID mẫu.
- Chưa chứng nhận email đến hộp thư thật. Sandbox-drop chỉ xác thực yêu cầu API, không giao thư.
- Link email dùng localhost trong môi trường test; khi triển khai cần đặt KAS_BOOKING_ACTION_BASE_URL và KAS_CUSTOMER_SITE_BASE_URL theo domain có thể truy cập.
- Sau khi người dùng cho phép riêng, đã thêm /[locale]/account/reset-password và đổi link email reset sang màn Next.js VI/EN. Giữ nguyên token 30 phút/dùng một lần và thu hồi session; gửi sau commit. Màn mới không lập lại quy trình cấp token và không thay mật khẩu qua GET. Hiện luồng yêu cầu gửi link vẫn qua API forgot-password/modal cũ; chưa thêm màn forgot mới vào Next.js.

## Xác minh

- BrevoEmailClientTest: 7 passed (brevo-unit.log), HTTP giả lập, không gửi thật.
- BookingEmailLanguageIT + AdminOperationsIT: 22 passed, zero failures/errors/skips (brevo-integration.log), bao gồm reset dùng lại/hết hạn và thu hồi session, zero skipped (brevo-integration.log), kas_web_test, Brevo mock.
- Frontend: 80 files / 1,438 tests passed; typecheck, scoped ESLint, production build passed. Sau bổ sung reset, 5 test giao diện liên quan passed (brevo-reset-frontend.log), typecheck/lint/bản dựng được kiểm tra lại.
- 10 yêu cầu Brevo sandbox-drop cho 5 sự kiện đặt phòng × VI/EN đều HTTP 201 (brevo-sandbox.json). Không gửi mail thật.
- Kiểm tra kiến trúc rộng còn lỗi sẵn có ở web.api site-image controllers phụ thuộc security/audit và danh mục module cũ chưa có customer/integration/review/voucher (brevo-architecture.log). Các lỗi không trỏ vào lớp email vừa thêm; không sửa ngoài phạm vi gửi mail.

Nguồn API: https://developers.brevo.com/reference/send-transac-email ; https://developers.brevo.com/docs/using-sandbox-mode

- Kiểm tra reset phát hiện Instant không được pgjdbc suy ra kiểu khi ghi expires_at; đã đổi sang OffsetDateTime UTC, giữ thời hạn 30 phút. Lỗi token không hợp lệ dùng envelope VALIDATION_FAILED/400 thay cho lỗi 500 ngoài ý muốn.


Cập nhật kiểm tra lại 25/10/2026 sau khi chủ dự án sửa ID: 18/18 template trong .env đều tồn tại và active. MEMBER_EMAIL_VERIFICATION_VI ID 9 đã trả HTTP 200 khi đọc và HTTP 201 khi thử sandbox-drop; lỗi 404 trước đó đã hết. Đã nạp lại backend trên kas_web_test. Việc ID hợp lệ không tự bổ sung trigger verification/nâng hạng/hoàn tất kỳ nghỉ còn thiếu; chưa thử giao thư tới hộp thư thật.

Runtime correction 25/10/2026: public website uses the approved original HTML frontend via frontend/server.js on http://localhost:3000/. Next.js admin remains http://localhost:3010/admin/login. Spring backend remains on port 8080 with kas_web_test. Express/multer were installed from frontend/package (2).json and its lockfile into backend/target/frontend-html-runtime, leaving the Next.js package untouched. CORS preflight from localhost:3000 and the HTML homepage were checked. The user started interacting with the HTML registration form; no account submission or email send was performed by the agent during this browser check.
