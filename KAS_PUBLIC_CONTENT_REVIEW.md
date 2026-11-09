# KAS — Bản rà soát dữ liệu public chờ Admin duyệt

**Trạng thái:** Bản nháp đối chiếu từ frontend hiện có; chưa được duyệt, chưa nhập vào database và chưa công khai.

## Nguồn đã đối chiếu

- `KAS_FRONTEND_CONTENT_BASELINE.json`: tên 8 khách sạn, nhóm tiện nghi theo khách sạn, tên loại phòng và tiện nghi phòng.
- `frontend/js/data.js`: địa chỉ, mô tả, giờ nhận/trả phòng, thông tin phòng, giá tham khảo, rating/review và tham chiếu ảnh. Nguồn của các trường không đồng nhất; đây là nội dung frontend cũ, không mặc định là dữ liệu vận hành đã duyệt.
- `KAS_PROPERTY_COORDINATES_INTAKE.csv`: địa chỉ được chép từ `frontend/js/data.js`. Tọa độ để trống theo quyết định hiện không cần Google Maps.

## Danh mục hiện có trong baseline

| Mã frontend | Khách sạn | Địa chỉ frontend | Loại phòng trong baseline | Số nhóm tiện nghi khách sạn |
|---|---|---|---|---:|
| hotel-01 | KAS Passion Boutique Hotel | 05 Truong Dinh, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Room; Superior Room; Family Room | 9 |
| hotel-02 | KAS Premium Boutique Hotel | 260 Ly Tu Trong, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Room; Superior Room; Deluxe Room; Deluxe Twin Room; Premium King Room with City View; Premium Twin Room with City View; Family Room with City View; Deluxe Family Room with City View | 12 |
| hotel-03 | KAS Ancient Luxury Hotel | 47A Nguyen Trai, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Double Room No Window; Superior Queen Room with City View; Deluxe King Room with Window; Deluxe Family Room with City View | 10 |
| hotel-04 | KAS Milestone Premium Hotel | 170–174 Nguyen Thai Binh, Nguyen Thai Binh Ward, District 1, Ho Chi Minh City | Deluxe Queen with Window; Premium Queen with Balcony & City View; Premium Twin with Window; Junior Suite with Balcony & City View; Superior Queen Room; Deluxe Queen Room with City View | 13 |
| hotel-05 | KAS Zody Boutique Hotel | 278 Le Thanh Ton, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Room No Window; Superior Room with Window; Double Double Room; Deluxe Double Room Street View; Studio Room; Suite Room | 9 |
| hotel-06 | KAS Sonata Luxury Hotel | 40–42 Bui Thi Xuan, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Double Room No Window; Deluxe Double Room with Window; Deluxe Twin Room; Deluxe Balcony Room; Premium King Room with City View; Deluxe Family Room with City View; Superior Double Room with Window; Deluxe Queen Room with City View; Premium Twin Room with City View | 10 |
| hotel-07 | KAS Eliana Luxury Hotel | 13 Bui Thi Xuan, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Double No Window; Deluxe Queen with City View; Premium King with City View; Premium Suite; Superior Queen Room; Deluxe King Room with Balcony | 11 |
| hotel-08 | KAS Dilly Luxury Hotel | 191 Le Thanh Ton, Ben Thanh Ward, District 1, Ho Chi Minh City | Standard Double Room No Window; Superior Queen Room No Window; Deluxe Queen Room with City View; Deluxe King Room with Window; Premium King Room with Balcony; Deluxe Queen Room with Balcony | 13 |

Tổng cộng: **48 loại phòng** trong baseline. Danh mục tiện nghi và tiện nghi từng loại phòng được giữ nguyên trong JSON nguồn để Admin đối chiếu từng mục.

## Admin cần xác nhận trước khi nhập/public

- Tên, địa chỉ và mô tả khách sạn (bản tiếng Việt và tiếng Anh).
- Tên loại phòng, cấu hình giường, diện tích, sức chứa, mô tả và số phòng có thể bán.
- Tiện nghi nào đang có thật tại từng khách sạn/phòng; chuẩn hoá nhãn VI/EN.
- Giá nào còn hiệu lực, đơn vị tiền tệ, ngày áp dụng và điều kiện bao gồm.
- Chính sách lưu trú chính thức. Chính sách huỷ đã được chủ sản phẩm quyết định trong cuộc trao đổi; **điều khoản no-show do Admin khách sạn cung cấp**.
- Ảnh nào KAS có quyền sử dụng, ảnh đại diện và nội dung mô tả thay thế (alt text) ở cả hai ngôn ngữ.
- Người duyệt và ngày duyệt cho từng khách sạn.

Không đưa rating/review bên thứ ba hoặc ảnh có nguồn ngoài vào dữ liệu public cho đến khi người phụ trách xác nhận nguồn và quyền sử dụng. Không suy ra số lượng phòng, tồn phòng hoặc tọa độ từ tên/địa chỉ.

## Cổng xuất bản

Đây là bản rà soát nội dung, không phải thao tác xuất bản. Chỉ nhập qua luồng quản trị hiện có sau khi Admin xác nhận; chỉ gửi duyệt/xuất bản khi đạt các điều kiện completeness đang được backend kiểm tra.
