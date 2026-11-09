# KAS — Báo cáo vòng 2 (03/11/2026)

Phạm vi: bỏ sửa voucher, voucher theo khách sạn, phân trang + hộp thư yêu cầu đặt phòng, trang chi tiết yêu cầu, thống nhất giao diện console ADMIN, và hai đặc tả website "FIX SAVED, HOMEPAGE NAVIGATION & CITY GUIDEBOOK ROUTING" và "REDESIGN ADMIN BOOKING REQUESTS & GUIDEBOOK EDITORIAL EXPERIENCE".

Trạng thái: đã chép vào `Kas_Web_Full` (109 tệp, đối chiếu checksum khớp). **Chưa commit, chưa deploy.** Không có migration mới; không đụng database production.

## 1. Admin — Yêu cầu đặt phòng

| Hạng mục | Kết quả |
|---|---|
| Thứ tự | Mới nhất trước: `ORDER BY requested_at DESC, reference DESC` (tie-break ổn định), áp dụng cho API, bảng, phân trang và cả 4 tab. Có lựa chọn "Cũ nhất trước" (`sort=oldest`). |
| Thanh điều khiển | Giữ 4 tab + lọc khách sạn; thêm ô tìm theo mã yêu cầu/tên khách (`q`, tối đa 100 ký tự, `%`/`_` được hiểu là ký tự thường), chọn thứ tự, tổng số kết quả (đếm trong DB, cùng bộ lọc). |
| Giữ bộ lọc | Tab, khách sạn, tìm kiếm, thứ tự và trang nằm trên URL; mọi liên kết giữ chúng. Danh sách tự làm mới mỗi 60 giây (và khi quay lại tab) mà không mất bộ lọc. |
| Bảng | Cột: Mã, Khách hàng, Khách sạn, Thời điểm gửi, Kỳ nghỉ, Phòng/khách, Giá trị, Thời hạn phản hồi, Trạng thái. Nhóm theo ngày gửi (giờ Việt Nam): Hôm nay / Hôm qua / 7 ngày gần đây / Cũ hơn, không sắp xếp lại. Bấm cả dòng để mở. Không gạch chân mặc định. Vừa 1366px không cuộn ngang. |
| "Mới" | Backend không lưu trạng thái đã xem/chưa xem theo từng người, nên yêu cầu chưa ai xử lý (`REQUESTED`) được nhấn mạnh bằng viền trái + chữ đậm. |
| Trang chi tiết | Header (mã, trạng thái, khách, khách sạn, thời điểm gửi, nút quay lại). Cột trái: kỳ nghỉ, phòng, khách, ghi chú nội bộ. Cột phải: Xử lý (trạng thái, ngày tạo, thời hạn, còn lại/quá hạn), các thao tác được phép, Lịch sử cập nhật (tiếng Việt, mới nhất trước), trạng thái email. Từ chối/Huỷ gom vào mục gập "Từ chối hoặc huỷ yêu cầu". |

API: `GET /api/v1/admin/sales/requests?…&q=&sort=newest|oldest&page=&size=` và `GET …/counts?property=&q=` (mở rộng endpoint có sẵn, không tạo API trùng).

## 2. Admin — Voucher và console

- Voucher không còn sửa sau khi tạo; mã do hệ thống tạo. Voucher áp dụng cho tất cả hoặc một số khách sạn (cột có sẵn `applicable_property_ids`, không cần migration).
- Thêm `PageHeader` dùng chung cho mọi màn: Tổng quan, Danh sách khách sạn, Hồ sơ chờ duyệt, Chính sách dùng chung, Điểm Trip.com, Đánh giá, Ảnh website, KAS Collection, Bản đồ section, Nguồn ảnh, Yêu cầu đặt phòng, Đặt phòng, Khách hàng, Voucher. Tất cả tiêu đề cùng cỡ chữ 28px (trước đây 24, 30 và 54px). Nút thao tác của trang nằm trong header.
- Nhóm ảnh website hiển thị tên dễ đọc (Trang chủ, Find Your KAS, Cẩm nang…) thay cho khoá kỹ thuật.

## 3. Website — Lưu khách sạn ("Lưu để xem sau")

**Nguyên nhân:** danh sách chỉ nằm trong localStorage của trình duyệt (dùng chung cho mọi tài khoản trên máy; khách chưa đăng nhập vẫn lưu được). Find Your KAS dùng id riêng (`passion`…) nên lưu xong bị rơi mất, và nút "Đặt phòng" ở đó dẫn về trang danh sách. Nút ở trang phòng chỉ hiện thông báo, không lưu gì.

**Sửa:**
- Lưu theo tài khoản: thêm `GET/PUT/DELETE /api/v1/me/favorites[/{slug}]`, dùng bảng **đã có sẵn** `customer_favorite_property` (khoá chính khách+khách sạn ⇒ không trùng lặp; lưu/bỏ lưu idempotent). Không có migration. Chỉ khách sạn đang hiển thị trên website mới lưu được.
- Một nút dùng chung (`data-save-hotel`) cho danh sách khách sạn, trang khách sạn, Find Your KAS, trang phòng; đổi trạng thái ngay (optimistic), đồng bộ mọi nút trên trang, hoàn tác nếu server báo lỗi.
- Chưa đăng nhập: bấm tim sẽ mở popup đăng nhập; đăng nhập xong khách sạn được lưu luôn.
- My KAS có mục "Khách sạn đã lưu (n)"; trang Saved hiển thị lời mời đăng nhập khi chưa đăng nhập.
- Danh sách cũ trong localStorage được xoá khi tải trang (vì không xác định được thuộc tài khoản nào).

## 4. Website — Header che nội dung

**Nguyên nhân:** header nổi `position: fixed` không chiếm chỗ; trang Khách sạn đặt "Quay lại trang chủ" ở 48–64px trong khi header cao 76px nên bị che và không bấm được. **Sửa:** riêng khi header nổi đứng ngay trước hero nhỏ, phần nội dung hero bắt đầu bên dưới đúng chiều cao header (`var(--nav-h)`), không dùng margin tuỳ ý. Hero trang chủ không đổi.

## 5. Website — "Theo nhịp sống của thành phố"

Bố cục 2 cột: trái là tiêu đề, mô tả, lịch trình; phải là ảnh. Bỏ chiều cao cố định 560px và `overflow:hidden` (trước đây cắt nội dung, chữ có dấu chồng nhau). Cỡ tiêu đề theo cột, line-height đủ cho dấu tiếng Việt. Tablet/mobile xếp dọc, ảnh tỉ lệ cố định. Đã kiểm tra 1920/1440/1366/1024/820/390: không cuộn ngang, không bị cắt.

## 6. Website — Cẩm nang: "Công viên 23 Tháng 9" hiện "Bến Thành"

Dữ liệu và slug đúng (`#september-23-park` có trong cả bản VI/EN). Ba nguyên nhân:
1. Breadcrumb luôn ghi "Bến Thành" → nay cập nhật theo địa điểm đang đọc (hash và vị trí cuộn).
2. Nút EN/VI bị script viết đè link và làm mất hash, nên khách quay về đầu trang (mục 01 Bến Thành) → nay giữ nguyên địa điểm khi đổi ngôn ngữ.
3. Mở link trực tiếp, trình duyệt cuộn trước khi ảnh/font tải xong nên dừng ở mục ngay trước (Chợ Bến Thành về đêm) → nay căn lại đúng mục khi trang ổn định, trừ khi khách đã tự cuộn.

Thêm: bỏ `id="city"` bị trùng; trang After Dark (VI) trỏ đúng bản VI; hỗ trợ URL không đuôi `.html`.

**Kiểm tra liên kết:** 109 liên kết Cẩm nang (city-guide, after-dark, guidebook VI/EN, trang chủ): 0 hỏng, 0 thiếu anchor.

## 7. Website — Cẩm nang dạng tạp chí

- Trang câu chuyện mới `guide-story.html?place=<slug>&lang=vi|en`: breadcrumb Trang chủ → Cẩm nang → Chủ đề → Địa điểm, header, ảnh hero, nội dung, "Gợi ý từ KAS", "Khách sạn KAS gần đây" (link tới trang khách sạn), câu chuyện cùng chủ đề, trước/sau, quay lại. Refresh, link trực tiếp, back/forward và đổi ngôn ngữ đều giữ đúng địa điểm; slug lạ hiện trang "Không tìm thấy".
- Trang Cẩm nang: thêm phần mở đầu (hero, câu chuyện nổi bật, khám phá theo chủ đề, "Bắt đầu với"), giữ các mục "Khám phá thành phố" và footer; mọi thẻ địa điểm mở trang câu chuyện.
- Nguồn dữ liệu duy nhất là chính các trang guidebook — không nhân bản nội dung. Chỉ hiển thị dữ liệu có thật: ảnh chỉ lấy từ Admin (`guidebook.entry.*`), không có ảnh thì là dải tối có chữ KAS; mẹo và khoảng cách lấy từ guidebook.

## 8. Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Backend `mvn verify` | 235 unit + 901 IT, 0 lỗi (35 skip có sẵn) |
| IT mới | lưu khách sạn theo tài khoản / idempotent / thứ tự / 404 / tài khoản khác không thấy / 401; tìm kiếm + sắp xếp hàng đợi |
| Frontend Vitest | 90 tệp, 1406 test pass |
| `tsc`, ESLint, `next build` | pass (2 cảnh báo có sẵn) |
| Trình duyệt (sandbox) | luồng lưu khách sạn đầy đủ; hộp thư yêu cầu + chi tiết 1920/1440/1366/820/390; Cẩm nang + trang câu chuyện VI/EN; console ADMIN 18 màn: tiêu đề 28px, không cuộn ngang |

## 9. Còn lại / lưu ý

- Ghi chú nội bộ không có tác giả và tiêu đề: backend không lưu tiêu đề, và chính sách hiện tại không tiết lộ danh tính nhân viên.
- "Câu chuyện mới nhất theo thời gian đăng": guidebook không có ngày đăng nên thay bằng "Bắt đầu với" (câu chuyện mở đầu mỗi chủ đề).
- Seen/unseen theo từng nhân viên chưa có trong backend.
- Chạy local: cần khởi động lại backend (API mới) **và** web server 3001 (server đọc danh sách trang `.html` lúc khởi động, nên `guide-story.html` chỉ có sau khi khởi động lại).
