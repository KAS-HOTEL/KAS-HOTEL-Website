# KAS — Đối chiếu tiện nghi frontend với Backend

Ngày rà soát: 19/10/2026  
Nguồn claim: `KAS_FRONTEND_CONTENT_BASELINE.json`, trích từ frontend cũ theo quyết định chủ sản phẩm.  
Mục đích: theo dõi ánh xạ dữ liệu trước khi migration được áp dụng; nguồn frontend không tự xác nhận khách sạn hiện còn cung cấp tiện nghi đó.

## Kết quả

- Frontend có 32 loại tiện nghi cấp khách sạn, 87 lượt gán cho 8 khách sạn, 10 tiện nghi phòng dùng chung và 3 tiện nghi phòng phát sinh theo từng phòng.
- Migration V33 có catalogue tiếng Anh và assignment cấp khách sạn khớp baseline.
- Migration V33 hiện bổ sung assignment tiện nghi cho 48 loại phòng theo khóa frontend `hNN-rN`, gồm cả “In-room telephone” và “Non-smoking” như người dùng yêu cầu dựa theo frontend.
- V33 thêm nhãn tiếng Việt cho 32 tiện nghi cấp khách sạn và 13 tiện nghi phòng.
- Có mã tương đương trùng nghĩa trong catalogue (`wifi-free` / `free-high-speed-wi-fi`, `reception-24h` / `24-hour-front-desk`, `airport-transfer` / `airport-transportation`). Dữ liệu mới dùng mã V33 hiện tại cho property và mã theo catalogue V4 cho room; không gộp/đổi các mã hiện có.

## Ánh xạ tiện nghi phòng

| Nhãn frontend | Mã Backend | Phạm vi |
|---|---|---|
| Free Wi-Fi | `wifi-free` | Tất cả phòng theo baseline |
| Air conditioning | `air-conditioning` | Tất cả phòng |
| Flat-screen TV | `flat-screen-tv` | Tất cả phòng |
| Mini fridge | `refrigerator` | Tất cả phòng; giữ nhãn frontend “Mini fridge” |
| Electric kettle | `kettle` | Tất cả phòng |
| Hair dryer | `hairdryer` | Tất cả phòng |
| Safe box | `in-room-safe` | Tất cả phòng |
| In-room telephone | `in-room-telephone` | Tất cả phòng; mã bổ sung theo claim frontend |
| Private bathroom | `private-bathroom` | Tất cả phòng |
| Non-smoking | `non-smoking-room` | Tất cả phòng; tách khỏi chính sách không hút thuốc cấp khách sạn |
| Rain shower | `rain-shower` | Theo từng phòng frontend |
| Bathtub | `bathtub` | Theo từng phòng frontend |
| Private balcony | `balcony` | Theo từng phòng frontend |

## Còn lại

- [x] Giữ nguồn claim frontend và ánh xạ theo `hNN-rN`.
- [x] Thêm mã, nhãn EN/VI và room assignment trong migration V33.
- [ ] Áp dụng V33 qua Flyway trên môi trường tích hợp/staging; hiện chưa xác nhận migration chạy ở môi trường đó.
- [ ] Operations xác minh claim thực tế theo từng khách sạn trước khi publish dữ liệu production.

