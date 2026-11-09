# KAS — Sơ đồ chức năng và checklist màn hình quản trị

Cập nhật 25/10/2026, đối chiếu file `page.tsx`, tab khách sạn và các thành phần giao diện hiện tại.

**Đây là tài liệu rà soát riêng. Không thêm trang sơ đồ hoặc mục menu mới vào website.**

## Cách đánh dấu

- **Có màn**: đã tìm thấy trang trong source, chưa đồng nghĩa mọi nhánh đã được nghiệm thu.
- Ô `[ ]` dùng để đánh dấu sau khi người kiểm tra mở và nghiệm thu màn hình.
- Một URL động đại diện cho một loại màn hình, không nhân bản theo số khách sạn/phòng.
- Form/hộp thoại nằm trong trang được kiểm riêng ở cuối; không tính thành một trang mới.
- Hai mảng dưới là cách chia công việc. Các URL `/admin` và `/partner` có thể nằm trong cùng một mảng nghiệp vụ, cùng dùng tài khoản SUPER_ADMIN theo quyết định 154.

**Tổng hợp: 30 màn vận hành + 4 màn nội dung + 3 màn dùng chung = 37 URL màn hình.** Ngoài ra có 5 route cũ/chưa hoàn thiện được ghi riêng, không tính là chức năng hoàn chỉnh.

## 1. Sơ đồ tổng thể

```text
QUẢN TRỊ KAS — một tài khoản dùng chung
│
├── DÙNG CHUNG
│   ├── Đăng nhập quản trị / đăng nhập vận hành
│   └── Tổng quan quản trị
│
├── A. VẬN HÀNH KHÁCH SẠN
│   ├── Tổng quan vận hành
│   ├── Đặt phòng
│   │   ├── Danh sách và chi tiết yêu cầu đặt phòng
│   │   ├── Kiểm tra thủ công → còn phòng: gửi QR / hết phòng: đề xuất phòng khác
│   │   ├── Khách sạn xác nhận đã nhận tiền
│   │   ├── Tra cứu danh sách và chi tiết đặt phòng
│   │   └── Yêu cầu hủy → phí theo % / số tiền → xem lại → khách quyết định
│   ├── Hồ sơ khách sạn
│   │   ├── Danh sách → tạo mới → tổng quan từng khách sạn
│   │   ├── Thông tin khách sạn
│   │   ├── QR và hướng dẫn thanh toán
│   │   ├── Hạng phòng → tạo / xem / sửa / gallery
│   │   ├── Gallery khách sạn
│   │   ├── Giá theo ngày / giá nâng cao
│   │   └── Chính sách riêng / chính sách dùng chung
│   ├── Chăm sóc khách hàng
│   │   ├── Hộp thư → hội thoại → mẫu tin nhắn
│   │   ├── Hồ sơ thành viên
│   │   ├── Đánh giá của khách
│   │   └── Voucher
│   └── Duyệt và công bố
│       ├── Hồ sơ chờ duyệt → chi tiết hồ sơ
│       └── Danh sách công bố → chi tiết / điểm Trip.com
│
└── B. QUẢN LÝ NỘI DUNG WEBSITE
    ├── Ảnh website
    │   ├── Hero và ảnh trang chủ
    │   ├── Hero các trang
    │   ├── Find Your KAS / Welcome Popup
    │   └── Guidebook
    ├── KAS Collection — tổng hợp ảnh đại diện khách sạn
    ├── Bản đồ section — đối chiếu vị trí ảnh, chỉ đọc
    └── Thư viện nguồn ảnh — tra cứu tham chiếu, chỉ đọc
```

Website không có dữ liệu tồn phòng, giữ phòng, tự trừ/hoàn tồn hoặc lịch còn/hết phòng. Sức chứa, số lượng khách yêu cầu và giá vẫn được quản lý.

## 2. Màn hình dùng chung — 3 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | C01 | Đăng nhập quản trị | `/admin/login` | Có màn; kiểm tra email/mật khẩu, lỗi và khóa đăng nhập. |
| [ ] | C02 | Đăng nhập vận hành | `/partner/login` | Có màn; cùng tài khoản và phiên đăng nhập với quản trị. |
| [ ] | C03 | Tổng quan quản trị | `/admin` | Có màn; thống kê hồ sơ, khách sạn và hàng đợi duyệt; không coi đây là toàn bộ báo cáo vận hành. |

## 3. Vận hành khách sạn — 30 màn

### A1. Tổng quan và đặt phòng — 6 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | VH01 | Tổng quan vận hành | `/partner` | Có màn; khách sạn, ảnh bìa và yêu cầu đang mở. |
| [ ] | VH02 | Danh sách yêu cầu đặt phòng | `/partner/requests` | Có màn; lọc trạng thái, sắp xếp, thời hạn phản hồi. |
| [ ] | VH03 | Chi tiết yêu cầu đặt phòng | `/partner/requests/[reference]` | Có màn; khối Trả lời yêu cầu: còn phòng và gửi QR, hết phòng và đề xuất phòng khác; xem lại đề xuất trước gửi; xác minh tiền riêng; ghi chú, liên hệ, từ chối/hủy. |
| [ ] | VH04 | Tra cứu đặt phòng | `/partner/reservations` | Có màn; tìm kiếm và xem các đặt phòng trong phạm vi. |
| [ ] | VH05 | Chi tiết đặt phòng | `/partner/reservations/[reference]` | Có màn; thông tin khách, kỳ nghỉ và lịch sử. Chưa coi đây là màn check-in/check-out. |
| [ ] | VH06 | Yêu cầu hủy và báo phí | `/partner/cancellation-requests` | Có màn; chọn phí theo % tổng giá trị đặt phòng hoặc số tiền cụ thể; xem mức phí dự kiến, ghi chú và xác nhận trước gửi; kiểm tra yêu cầu đổi trạng thái/hết hạn. |

### A2. Tin nhắn — 3 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | VH07 | Hộp thư | `/partner/messages` | Có màn; danh sách hội thoại, trạng thái đọc và tìm kiếm/lọc theo chức năng hiện có. |
| [ ] | VH08 | Hội thoại đặt phòng | `/partner/messages/[reference]` | Có màn; đọc, trả lời, lỗi gửi và tải lại. |
| [ ] | VH09 | Mẫu tin nhắn | `/partner/messages/templates` | Có màn; soạn và quản lý mẫu theo chức năng được API hỗ trợ. |

### A3. Hồ sơ khách sạn, hạng phòng và ảnh — 10 màn

`P = /partner/properties/[propertyId]`; `R = P/rooms/[roomTypeId]`.

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | VH10 | Danh sách khách sạn | `/partner/properties` | Có màn; chọn đúng khách sạn để vào các tab con. |
| [ ] | VH11 | Tạo khách sạn | `/partner/properties/new` | Có màn; cần nghiệm thu quyền/tài khoản GLOBAL và việc xác định đối tác sở hữu. |
| [ ] | VH12 | Tổng quan khách sạn | `P` | Có màn; hồ sơ, điều kiện công bố và mục QR/hướng dẫn thanh toán. |
| [ ] | VH13 | Thông tin khách sạn | `P/information` | Có màn; thông tin VI/EN, địa chỉ, tiện ích và trường biên tập hiện có. |
| [ ] | VH14 | Danh sách hạng phòng | `P/rooms` | Có màn; đúng khách sạn, trạng thái và đường vào xem/sửa/ảnh. |
| [ ] | VH15 | Tạo hạng phòng | `P/rooms/new` | Có màn; nội dung, sức chứa, giường và tiện ích; không có tồn phòng. |
| [ ] | VH16 | Chi tiết hạng phòng | `R` | Có màn xem; đường vào chỉnh sửa và gallery. |
| [ ] | VH17 | Chỉnh sửa hạng phòng | `R/edit` | Có màn; lưu dữ liệu, validation và xung đột phiên bản. |
| [ ] | VH18 | Gallery hạng phòng | `R/media` | Có màn; URL HTTPS / R2, mô tả, sắp xếp, ảnh chính và gỡ liên kết. |
| [ ] | VH19 | Gallery khách sạn | `P/media` | Có màn; URL HTTPS / R2, danh mục, thư viện dùng chung và chọn ảnh đại diện. |

### A4. Giá và chính sách — 4 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | VH20 | Giá theo ngày | `P/calendar` | Có màn; lịch giá theo hạng phòng/ngày, không phải lịch tồn. |
| [ ] | VH21 | Giá nâng cao | `P/rates` | Có màn riêng; giá cơ sở, quy tắc giá và cập nhật theo khoảng ngày. Vào từ màn Giá, không cần một mục menu gốc mới. |
| [ ] | VH22 | Chính sách riêng khách sạn | `P/policies` | Có màn; bản nháp, nội dung VI/EN, hiệu lực, áp dụng/tạm ngưng/lưu trữ. |
| [ ] | VH23 | Chính sách dùng chung | `/partner/policies` | Có màn; chọn khách sạn làm ngữ cảnh đối tác và kiểm tra ưu tiên chính sách riêng. |

### A5. Duyệt, công bố và điểm Trip.com — 4 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | VH24 | Danh sách công bố khách sạn | `/admin/properties` | Có màn; điều kiện hồ sơ, duyệt/mở bán và liên kết sang chi tiết. |
| [ ] | VH25 | Chi tiết quản trị khách sạn | `/admin/properties/[propertyId]` | Có màn; nhập điểm Trip.com theo quý, nguồn và ngày đối chiếu. |
| [ ] | VH26 | Hồ sơ chờ duyệt | `/admin/review` | Có màn; đây là duyệt hồ sơ khách sạn, khác với đánh giá của khách. |
| [ ] | VH27 | Chi tiết hồ sơ chờ duyệt | `/admin/review/[submissionId]` | Có màn; xem hồ sơ, điều kiện và quyết định theo API hiện có. |

### A6. Thành viên, đánh giá và ưu đãi — 3 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | VH28 | Khách hàng thành viên | `/admin/customers` | Có màn; tra cứu, phân trang, sửa liên hệ trong hộp thoại. Hạng/điểm chỉ đọc. |
| [ ] | VH29 | Đánh giá của khách | `/admin/reviews` | Có màn; duyệt/từ chối bài chờ, ẩn/hiện bài công bố, xóa mềm và lưu lý do. |
| [ ] | VH30 | Voucher | `/admin/vouchers` | Có màn; danh sách, lọc, tạo trong hộp thoại và đổi trạng thái. Không có màn sửa toàn bộ/xóa voucher riêng. |

## 4. Quản lý nội dung website — 4 màn

| Đã kiểm | ID | Màn hình | Đường dẫn | Tình trạng / cần kiểm |
| --- | --- | --- | --- | --- |
| [ ] | ND01 | Ảnh website | `/admin/content/images` | Có màn chỉnh ảnh/bật tắt vị trí; gom Hero, trang chủ, các trang, Find Your KAS, Welcome Popup, Guidebook. Đây không phải trình biên tập toàn bộ chữ trên website. |
| [ ] | ND02 | KAS Collection | `/admin/collection` | Có màn tổng hợp ảnh bìa; chọn khách sạn sẽ mở gallery VH19. Không lưu bộ ảnh khác riêng biệt. |
| [ ] | ND03 | Bản đồ section | `/admin/content/map` | Có màn chỉ đọc; đối chiếu nhóm, vị trí và ảnh đang áp dụng. |
| [ ] | ND04 | Thư viện nguồn ảnh | `/admin/content/sources` | Có màn chỉ đọc; tìm tham chiếu, nguồn và trạng thái xác minh của ảnh cũ. |

### Ranh giới tránh trùng chức năng

- Ảnh khách sạn: **VH19** là nơi sửa; **ND02** là màn tổng hợp dẫn tới cùng nơi sửa đó.
- Ảnh hạng phòng: **VH18**, mở sau khi đã chọn khách sạn và hạng phòng.
- Hero, Guidebook, Find Your KAS, Welcome Popup: các nhóm trong **ND01**, chưa phải bốn màn riêng.
- Chữ giới thiệu khách sạn/hạng phòng: sửa ở **VH13/VH17**. Biên tập chữ các section website là phạm vi khác, không suy ra có sẵn từ màn Ảnh website.
- **VH26/VH27** duyệt hồ sơ khách sạn; **VH29** duyệt bài đánh giá của khách.

## 5. Checklist form, hộp thoại và nhánh thao tác

Đây là thao tác bên trong màn hình, không cộng vào tổng 37 URL.

- [ ] VH03 — Duyệt phòng thủ công và gửi QR: thiếu QR báo lỗi; không tự xác nhận đã nhận tiền.
- [ ] VH03 — Đề xuất: chọn khách sạn/hạng phòng, ngày, số lượng, tổng giá, lời nhắn; khách đồng ý tạo yêu cầu mới.
- [ ] VH03 — Xác nhận tiền: chỉ ở trạng thái chờ thanh toán, xác nhận rõ trước khi ghi nhận.
- [ ] VH03 — Ghi chú, liên hệ, từ chối và hủy: quyền, lý do, trạng thái cuối, thao tác lặp.
- [ ] VH06 — Báo phí hủy: chọn phần trăm hoặc số tiền; 0%, 100%, phần trăm lẻ tối đa 2 chữ số thập phân; xem lại trước gửi; máy chủ tính từ tổng giá trị đặt phòng và làm tròn HALF_UP về đơn vị tiền nhỏ nhất. Khách quyết định trước khi hủy hoàn tất.
- [ ] VH08/VH09 — Trả lời và mẫu tin: đang gửi, lỗi gửi, nội dung được lưu và tải lại.
- [ ] VH12 — Mục Thanh toán đặt phòng: đọc/lưu QR HTTPS và hướng dẫn riêng của khách sạn.
- [ ] VH18/VH19 — Thêm URL/R2: đúng chủ sở hữu, mô tả VI/EN, điều kiện công khai, sắp xếp/chọn bìa/gỡ ảnh.
- [ ] VH20/VH21 — Sửa giá và áp dụng hàng loạt: xem lại phạm vi, giá trị, xác nhận và lỗi xung đột.
- [ ] VH22/VH23 — Soạn hai ngôn ngữ, điều kiện áp dụng, tạm ngưng/lưu trữ phiên bản.
- [ ] VH25 — Nhập Trip.com: ngày đầu quý đúng, nguồn, ngày đối chiếu; quý cũ không ghi đè điểm của quý mới.
- [ ] VH28 — Chỉnh sửa hồ sơ khách: không sửa email/hạng/điểm ngoài contract hiện tại.
- [ ] VH29 — Hộp thoại kiểm duyệt: nhập đủ lý do, không mất con trỏ, không gửi lặp, không sửa nội dung khách.
- [ ] VH30 — Tạo mã: phần trăm/số tiền/quyền lợi, ngày áp dụng, điều kiện lưu trú, hạn mức, mã trùng.
- [ ] ND01 — Đổi ảnh, bật/tắt và dùng lại ảnh mặc định; dữ liệu còn sau tải lại trang.
- [ ] ND03/ND04 — Chỉ đọc; không hiển thị nút lưu hoặc giả trạng thái nguồn ảnh đã xác minh.

### 5.1. Chi tiết luồng phản hồi và phí hủy — bổ sung 25/10/2026

```text
Chi tiết yêu cầu đặt phòng (VH03)
├── Admin kiểm tra phòng thủ công
│   ├── Còn phòng → xác nhận → gửi QR riêng của khách sạn → chờ thanh toán
│   │   └── Đối chiếu ngân hàng → xác nhận đã nhận tiền → xác nhận đặt phòng
│   └── Hết phòng → chọn khách sạn / hạng phòng khác
│       └── Chọn ngày, số phòng, tổng giá, lời nhắn → xem lại → gửi đề xuất
│           └── Khách quyết định theo luồng đề xuất hiện có
└── Hủy / báo phí: xử lý tại VH06, tách khỏi việc ghi nhận khách rút yêu cầu

Yêu cầu hủy (VH06)
├── Phần trăm → tổng giá trị đặt phòng × % → làm tròn đơn vị tiền nhỏ nhất
└── Số tiền cụ thể → nhập số tiền theo tiền tệ đặt phòng
    → xem mức phí và ghi chú → xác nhận gửi → khách chấp nhận / từ chối
```

- [ ] Thiếu QR: từ chối gửi, giữ nguyên trạng thái; không tự tạo QR hoặc tự xác nhận tiền.
- [ ] Đề xuất: hiển thị lại khách sạn, hạng phòng, ngày, số phòng, tổng giá và lời nhắn trước gửi.
- [ ] Không nhầm xác nhận còn phòng với xác nhận đã nhận tiền; hai thao tác riêng.
- [ ] Phí 25% của 1.500.000 VND = 375.000 VND; 10% của 10.005 VND làm tròn thành 1.001 VND.
- [ ] Số tiền cụ thể nhập theo đơn vị tiền hiển thị, không yêu cầu admin tự quy đổi sang đơn vị nhỏ nhất.
- [ ] Từ chối phần trăm âm, trên 100%, quá 2 chữ số thập phân; không tính % khi chưa có tổng giá.
- [ ] Máy chủ lấy tổng giá trị đặt phòng từ dữ liệu lưu, không dùng số tiền căn cứ do trình duyệt gửi.
- [ ] Lưu loại phí, phần trăm và số tiền căn cứ trong nhật ký kiểm toán; lưu mức tiền cuối cùng cho khách quyết định.
- [ ] Khóa gửi lặp; yêu cầu hết hạn/đã báo phí trả lỗi; báo phí không tự hủy đặt phòng.
- [ ] Kiểm tra gửi email thực tế riêng theo cấu hình; lưu quyết định thành công không đồng nghĩa email đã đến khách.

## 6. Màn/luồng còn thiếu hoặc chưa hoàn chỉnh

| Đã kiểm | Hạng mục | Hiện trạng |
| --- | --- | --- |
| [ ] | Check-in / check-out / no-show | Chi tiết đặt phòng hiện chủ yếu là màn xem; chưa có đầy đủ màn/nút và API vận hành các chuyển trạng thái này. Không đánh dấu có chỉ vì thấy ngày nhận/trả phòng. |
| [ ] | Biên tập chữ toàn bộ website | Chưa có một màn CMS đầy đủ cho chữ các section, menu và footer; màn Ảnh website chủ yếu quản lý vị trí ảnh. |
| [ ] | Lịch sử gửi email / gửi lại | Chưa có màn hoàn chỉnh để xác nhận thư đã đến khách, xem lỗi và gửi lại theo quyền. Cần phân biệt trạng thái nghiệp vụ với gửi thư thành công. |
| [ ] | Tự khôi phục tài khoản admin | Các route partner forgot/reset/verify còn mang trạng thái chưa khả dụng hoặc form chưa nối submit. Không coi là recovery staff hoàn chỉnh. |
| [ ] | Nghiệm thu giao diện với dữ liệu thật | Có code và test không thay thế việc kiểm tra quyền, phiên đăng nhập, tải/lưu dữ liệu và các nhánh lỗi trên trình duyệt. |

## 7. Route cũ không tính là màn chức năng hoàn chỉnh — 5 route

| Route | Hiện trạng |
| --- | --- |
| `/partner/properties/[propertyId]/inventory` | Chuyển sang lịch giá; không có màn tồn phòng. |
| `/partner/register` | Đã rút, trả not-found. |
| `/partner/forgot-password` | Thông báo chưa có khôi phục tự phục vụ cho staff. |
| `/partner/reset-password` | Form cũ, submit chưa khả dụng theo source hiện tại. |
| `/partner/verify-code` | Giao diện mã xác thực cũ; chưa có đầy đủ luồng gửi/xác thực hoạt động. |

## 8. Admin HTML V22 — giữ riêng để đối chiếu

- `frontend/admin.html` + `frontend/js/admin.js`: admin cũ, không phải một trang con của Next.js.
- Không cộng các mục bên trong admin V22 vào tổng màn Next.js ở trên.
- Giữ admin cũ và dữ liệu ảnh/giá đến khi đối chiếu xong. Chưa gỡ Node cũ, JSON hoặc uploads.
- Các tài liệu/log lịch sử ở `docs/legacy-frontend/`.

## 9. Điều kiện nghiệm thu mỗi màn

1. Mở đúng route, đúng khách sạn/hạng phòng/đặt phòng.
2. Có trạng thái tải, không dữ liệu, lỗi và thử lại phù hợp.
3. Bộ lọc, phân trang và điều hướng không đưa vào ngõ cụt.
4. Form được gắn nhãn, kiểm tra dữ liệu và khóa thao tác trùng khi đang lưu.
5. Lưu xong tải lại vẫn còn dữ liệu; lỗi không báo thành công.
6. Quyền, phiên đăng nhập và phạm vi dữ liệu được backend kiểm tra.
7. Dùng được trên màn nhỏ và bằng bàn phím.
8. Không xuất hiện tồn phòng, giữ phòng hoặc xác nhận tiền thay cho khách sạn.

## 10. Cập nhật kết nối test và email — 25/10/2026

- Web test dùng kas_web_test, cùng tài khoản admin dùng chung đã được chủ dự án cho phép sao chép.
- [ ] Quốc tịch VN nhận mẫu VI; US/JP/khác nhận EN dù giao diện đang dùng ngôn ngữ ngược lại. Không có quốc tịch dùng EN.
- [ ] Email QR đúng mã riêng khách sạn, thông tin đặt phòng, số tiền; link báo thanh toán vẫn dùng được.
- [ ] Email đề xuất mở được trang xem lại, chấp nhận/từ chối; chỉ tạo yêu cầu mới sau khách đồng ý.
- [ ] Email hủy chỉ có sau hủy thực sự, chưa gửi khi mới báo phí.
- [ ] Email chào mừng dùng quốc tịch đã chọn lúc đăng ký, không suy ra từ locale.
- [ ] Kiểm tra hộp thư thật riêng; sandbox-drop không xác nhận khả năng giao thư.
- [ ] Bổ sung mẫu xác minh email VI còn thiếu (Brevo 404); hoàn thiện trigger verification/nâng hạng/hoàn tất kỳ nghỉ trước khi nghiệm thu các email đó.

Chi tiết triển khai và giới hạn: docs/verification/2026-10-25-admin-ui/BREVO_AND_TEST_WEB.md.

- [ ] Email reset mở /[locale]/account/reset-password trong Next.js: nhập lại mật khẩu khớp, thiếu token/hết hạn/dùng lại, lưu thành công và đăng nhập lại. Đây là màn khách hàng ngoài tổng 37 URL admin/partner.


Cập nhật kiểm tra lại 25/10/2026 sau khi chủ dự án sửa ID: 18/18 template trong .env đều tồn tại và active. MEMBER_EMAIL_VERIFICATION_VI ID 9 đã trả HTTP 200 khi đọc và HTTP 201 khi thử sandbox-drop; lỗi 404 trước đó đã hết. Đã nạp lại backend trên kas_web_test. Việc ID hợp lệ không tự bổ sung trigger verification/nâng hạng/hoàn tất kỳ nghỉ còn thiếu; chưa thử giao thư tới hộp thư thật.
