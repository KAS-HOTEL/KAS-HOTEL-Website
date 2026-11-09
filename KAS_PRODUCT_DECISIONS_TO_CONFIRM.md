# KAS — Quyết định sản phẩm cần chốt

Tài liệu này cụ thể hóa mục P0 đầu tiên trong [KAS_DELIVERY_CHECKLIST.md](KAS_DELIVERY_CHECKLIST.md). Nội dung dưới đây lấy từ các quyết định đang mở trong `docs/kas`; không tự điền dữ liệu thực tế cho khách sạn.

## Đã chốt và các việc cần hoàn tất

### 1. Cách tìm khách sạn theo nhu cầu chuyến đi — đã chốt theo frontend hiện có

Theo chỉ đạo của chủ sản phẩm, dùng bốn lựa chọn trên `frontend/find-your-kas.html` làm nhóm nhu cầu chuyến đi: **Family trip**, **Slow traveller**, **Business**, **Longer stay**. Đây là gợi ý biên tập để khám phá khách sạn, không phải phân hạng chất lượng hay thuộc tính cố định của khách sạn. Mã frontend hiện có đã gán khách sạn vào từng lựa chọn; cần giữ các gán này khi chuyển luồng sang Next.js/Backend:

Các lựa chọn này là **travel-intent filters**, không phải `property.collection` và không phải phân khúc/đẳng cấp khách sạn. Chúng thay cho ý tưởng collections đề xuất trước đó trong luồng khám phá này.

| Lựa chọn | Khách sạn theo dữ liệu hiện tại của frontend |
|---|---|
| Family trip | 01 Passion, 02 Premium, 03 Ancient, 04 Milestone |
| Slow traveller | 01 Passion, 03 Ancient, 05 Zody, 06 Sonata, 07 Eliana, 08 Dilly |
| Business | 02 Premium, 04 Milestone, 06 Sonata, 07 Eliana, 08 Dilly |
| Longer stay | 03 Ancient, 05 Zody, 06 Sonata, 07 Eliana, 08 Dilly |

**Trạng thái:** [x] Chủ sản phẩm chỉ định dùng bốn nhóm sẵn có. Việc đưa bộ lọc/gợi ý này vào frontend Next.js vẫn cần triển khai; danh sách trên lấy nguyên từ trang hiện hành. Bộ dữ liệu máy đọc được được lưu tại [KAS_FRONTEND_CONTENT_BASELINE.json](KAS_FRONTEND_CONTENT_BASELINE.json).

### 2. Tiện nghi và cơ sở vật chất thực tế — lấy dữ liệu frontend làm nguồn khởi đầu

Theo chỉ đạo của chủ sản phẩm, dùng tiện nghi đang hiển thị trong `frontend/js/data.js` làm bộ dữ liệu khởi đầu. `frontend/DATA_AUDIT.md` ghi nguồn amenities của khách sạn là Tripadvisor + Trip.com; tiện nghi phòng dùng danh sách chung trong frontend và có biến thể theo bồn tắm/ban công. Migration V33 có nhãn EN và assignment cấp khách sạn; nhãn VI và assignment tiện nghi phòng còn thiếu.

- [x] Chọn frontend hiện tại làm nguồn dữ liệu đầu vào; baseline đã trích xuất vào [KAS_FRONTEND_CONTENT_BASELINE.json](KAS_FRONTEND_CONTENT_BASELINE.json).
- [x] Đối chiếu baseline với taxonomy/migration Backend; kết quả và các điểm cần duyệt được ghi tại [KAS_AMENITY_MAPPING_REVIEW.md](KAS_AMENITY_MAPPING_REVIEW.md). Migration V33 chứa catalogue EN và assignment cấp khách sạn khớp baseline; cần áp dụng migration qua quy trình riêng.
- [x] Thêm nhãn VI và assignment tiện nghi phòng theo khóa `hNN-rN` từ frontend vào migration V33; việc áp dụng migration và xác minh claim thực tế vẫn còn.
- [ ] Không tự thêm claim accessibility mới; chỉ đưa vào nếu đã có trong frontend và nguồn ghi nhận.

### 3. Chính sách hủy và no-show

Theo quyết định của chủ sản phẩm, nội dung hủy đặt phòng dùng làm baseline cho giao diện và Backend:

- Khách hàng thường có thể hủy **trước giờ nhận phòng ít nhất 24 giờ**.
- Khách hàng thành viên có thể hủy **đến 12:00 trưa ngày nhận phòng**.
- Khách liên hệ khách sạn để biết phí hủy; hiện chưa có mức phí cụ thể để hiển thị.
- Hủy đúng hạn được miễn phí. Nếu quá thời hạn miễn phí, tạo yêu cầu để khách sạn báo phí; chỉ hoàn tất hủy sau khi khách xác nhận đồng ý.

Không diễn giải đây là hủy miễn phí, vì quyết định chưa nói rằng phí bằng 0. Cần hiển thị đúng thời hạn và hướng dẫn hỏi khách sạn về phí.

- [x] Chủ sản phẩm cung cấp quy tắc thời hạn hủy và cách hỏi phí như trên.
- [x] Chốt xử lý phí: trong hạn miễn phí thì hủy ngay; quá hạn thì khách sạn báo phí và chờ khách xác nhận trước khi hủy.
- [ ] Commercial xác nhận nội dung vận hành; Legal rà soát câu chữ/điều khoản trước khi publish.
- [x] Định nghĩa khách hàng thành viên: tài khoản có trạng thái thành viên hợp lệ tại thời điểm đặt phòng.
- [x] Liên kết reservation với tài khoản chỉ khi khách đã đăng nhập; vẫn cho phép đặt phòng ẩn danh. Không tự ghép tài khoản bằng email chưa xác minh.
- [ ] Backend ghi snapshot membership và đã có endpoint xem reservation của chính chủ; còn endpoint huỷ, áp dụng mốc thời gian, cùng kiểm chứng quyền truy cập trước khi xem là xong.
- [ ] Nhận chính sách no-show riêng: thời điểm xác định khách không đến, phí/thu tiền và xử lý tồn phòng. Phần này vẫn đang mở; không suy ra từ chính sách hủy.
- [ ] Chỉ bật luồng booking production sau khi điều khoản được duyệt và chính sách no-show được chốt theo gate hiện hành.

## Đã được xử lý trong mã hiện tại — không cần quyết định lại

### Trải nghiệm đặc trưng và điều kiện publish

Tài liệu sản phẩm yêu cầu ít nhất một trải nghiệm đặc trưng trước khi publish. Mã hiện tại đã có màn Partner nhập/sửa/xóa, API Backend và kiểm tra publish. Phạm vi V1 trong mã là tiêu đề VI/EN, mô tả tùy chọn và thứ tự; ảnh và thời điểm trong ngày được để ngoài V1. Vì vậy, câu hỏi trước đây về việc bỏ/giữ gate không còn là việc cần chốt trừ khi chủ sản phẩm muốn đổi yêu cầu.

## Dữ liệu sản phẩm cần thu thập song song

Các mục này là dữ liệu đầu vào, không phải lựa chọn kỹ thuật:

- [ ] Tên hiển thị, địa chỉ VI/EN, quận/phường, tọa độ và kênh liên hệ đã xác minh cho 8 khách sạn.
- [ ] Loại phòng thực tế, cấu hình giường, sức chứa, diện tích, số lượng phòng theo ngày và ảnh phòng.
- [ ] Giá cơ sở được Revenue duyệt; xác nhận thành phần bao gồm/không bao gồm theo chính sách hiện hành.
- [ ] Ảnh được cấp quyền sử dụng, chú thích và alt text VI/EN cho từng khách sạn/phòng.

## Có thể chốt sau, nhưng cần trước khi bán trực tuyến

- [ ] OTA: cung cấp sản lượng/phân bổ 12 tháng theo khách sạn và kênh để Operations/Revenue xác định OTA safety buffer (OQ-033/B3). Chưa có số liệu thì không tự đặt buffer.
- [ ] Media upload: xác nhận nhà cung cấp lưu trữ/credential và quy trình bảo mật trước khi bật upload trực tiếp (OQ-106).

## Trạng thái

- Đã ghi nhận chỉ đạo: dùng bốn cách khám phá trên frontend; lấy amenities từ frontend làm dữ liệu đầu vào; giao Commercial cung cấp chính sách chính thức, có Legal rà soát.
- Việc phân công trên là theo vai trò, chưa gán tên cá nhân và chưa gửi thông báo cho ai.
- Còn việc triển khai/chuyển dữ liệu vào Backend và nhận văn bản chính sách đã duyệt.
