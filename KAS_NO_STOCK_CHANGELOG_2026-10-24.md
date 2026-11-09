# KAS — Website không quản lý tồn phòng

Quyết định chủ project ngày 24/10/2026: admin tự kiểm tra phòng thủ công bên ngoài website. Nguồn chuẩn: `docs/kas/153-owner-decision-no-website-inventory.md`.

## Thay đổi đã thực hiện

- Gỡ calendar/bulk editor/domain/API client quản lý tồn phòng khỏi Next.js. Tab quản trị chỉ còn **Giá**; calendar giữ khả năng xem, đặt và xóa giá theo ngày. URL quản lý tồn cũ chuyển sang lịch giá.
- Gỡ nhãn “còn X phòng”, “hết phòng”, giới hạn theo số phòng còn lại, thứ tự ưu tiên theo tồn và các trường `availableQuantity`, `availableForWholeStay`, `maxQuantitySelectable` khỏi dữ liệu public đang dùng. Không thay số thật bằng số giả hoặc “vô hạn”.
- Số lượng phòng khách chọn là số lượng **yêu cầu**. Sức chứa của loại phòng, thông tin mô tả và giá vẫn được giữ. Giới hạn 30 của control là giới hạn giao diện có sẵn, không phải tồn phòng và không phải xác nhận phòng trống.
- Đổi public pricing API sang `GET /api/v1/public/request-pricing/properties/{slug}` và `POST /api/v1/public/request-pricing/quote`. Response lựa chọn chỉ gồm roomTypeSlug, name và nightlyFrom. Quote/submit chỉ đọc publication, sức chứa và giá; không đọc tồn, không kiểm tra inventory horizon, không giữ phòng.
- Gỡ controller quản lý tồn/buffer; các class stock engine/expiry lịch sử không còn đăng ký Spring bean hoặc scheduled job. Chỉ các component phục vụ room metadata, property identity và pricing còn hoạt động trong package mang tên lịch sử `inventory`.
- Hủy yêu cầu, hủy lưu trú và từ chối không đọc/ghi/trừ/hoàn tồn, không yêu cầu CONVERTED hold. Bỏ truy vấn kiểm tra tồn tự động không còn dùng trong sales service và bỏ thông báo “đã trả hold” giả.
- Giữ manual hotel review, QR của khách sạn, báo chuyển khoản và hotel xác minh tiền. Xác nhận thanh toán không trở thành hành động tự động kiểm tra hay phân bổ phòng.
- Cập nhật checklist, prompt Claude và danh mục API theo quyết định mới. “API catalog” chỉ là danh mục endpoint, không liên quan tồn phòng.

## Dữ liệu và lịch sử

Không chạy SQL, không sửa/xóa database, không sửa migration đã áp dụng. Bảng, migration, một số class không hoạt động và dữ liệu tồn phòng lịch sử vẫn được giữ để không phá lịch sử triển khai. Website hiện tại không sử dụng chúng; không được khôi phục entry point cũ chỉ để đáp ứng tài liệu hoặc test cũ.

Đã bỏ các test suite dành riêng cho tính năng bị gỡ: InventoryIT, InventoryConcurrencyIT, BufferPrecedenceIT, HoldExpiryIT, AvailabilityIT, BulkOperationsIT; cùng các test frontend inventory/merged operations. Lịch sử nằm trong Git. Các kiểm tra giá còn dùng được được giữ và chuyển sang endpoint mới; thêm kiểm tra request pricing không có số tồn, old public availability route không được map và job stock expiry không được đăng ký/lên lịch. Các test lựa chọn phòng đổi sang kiểm tra manual review thay vì dựng dữ liệu tồn giả.

Một số integration test lịch sử trong reservation/sales vẫn chứa giả định hold cũ từ trước quyết định manual review. Chưa chạy hoặc chứng nhận toàn bộ integration suite. Khi chuyển các case này, giữ kiểm tra quyền, idempotency, payment và state machine; thay assertion stock bằng invariant không đọc/ghi stock. Không bỏ những kiểm tra bảo mật hoặc khôi phục tồn phòng để làm test xanh.

## Kiểm chứng

Kết quả cuối được ghi bên dưới sau khi chạy. Không có browser E2E, migration/deploy hay kiểm thử với email/database vận hành trong thay đổi này. Production build từng bị chặn tải Google Fonts ở baseline; không suy ra build production thành công từ typecheck/unit tests.

### Kết quả kiểm tra cuối

- Frontend typecheck: PASS.
- Frontend Vitest toàn bộ: **75 files, 1.422 tests PASS**, 0 failed. Số test giảm so với baseline vì đã bỏ các suite của tính năng tồn phòng bị loại bỏ; không so sánh số test như thước đo chất lượng đơn lẻ.
- Sau các chỉnh sửa cuối về nhãn onboarding/overview và equality, chạy lại 4 file liên quan: **121 tests PASS**.
- Lint 10 file trung tâm vừa sửa/thêm (calendar, room selection, domain): PASS, không error/warning. Đây không phải xác nhận toàn repo đã sạch lint; baseline audit có các lỗi ngoài phạm vi.
- Backend targeted unit/HTTP tests: **7 tests PASS**, 0 failures/errors/skipped: ManualRequestPricingTest (2), ManualRequestPricingControllerTest (2), HoldExpirySchedulerTest (3). Maven đã compile cả source/test source trong lần chạy này.
- `git diff --check`: PASS.
- Chưa chạy toàn bộ backend integration suite, browser E2E hoặc production build sau thay đổi. Lỗi tải Google Fonts và các lỗi kiến trúc ghi trong audit vẫn là việc riêng cần xác minh/khắc phục. Không suy ra toàn backend xanh từ 7 tests này.

Logs local: `frontend/no-stock-typecheck.log`, `no-stock-tests.log`, `no-stock-final-subset.log`, `no-stock-lint.log`, `backend/no-stock-unit-verified.log` và Surefire reports. Không gửi mail hoặc dùng database vận hành trong các test targeted này.

### Checklist Claude sau thay đổi

- [x] Bỏ giao diện, API client và endpoint quản lý tồn phòng/buffer.
- [x] Giá/quote/request không cần inventory rows hoặc inventory settings.
- [x] Public response không có số phòng còn lại, availability flag hoặc stock ceiling.
- [x] Hủy/từ chối không đòi hold và không cập nhật stock.
- [x] Không có stock bean/job đang đăng ký trong runtime.
- [x] Giữ chức năng giá theo ngày, giá cơ bản và áp giá hàng loạt.
- [x] Cập nhật prompt/checklist và danh mục API theo quyết định mới.
- [ ] E2E đầy đủ manual hotel review → payment → confirmation → free/fee cancellation trên database test.
- [ ] Chuyển các integration assertion reservation/sales còn theo mô hình hold lịch sử sang invariant không có stock; không khôi phục engine cũ.
- [ ] Build production trong môi trường có fonts hoặc phương án font local đã được duyệt, rồi smoke test deployment.
