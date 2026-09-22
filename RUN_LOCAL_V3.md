# KAS Hotel Collection — chạy local sau khi cập nhật V3

## 1. Giữ nguyên ảnh đã upload
Không xóa thư mục `uploads` trong project cũ. Bản ZIP V3 cố ý không kèm `uploads` để file nhẹ. Khi cập nhật, hãy chép/giải nén nội dung V3 đè vào `C:\kas-hotels (2)` và chọn Replace/Overwrite; thư mục `uploads` sẽ được giữ lại.

## 2. Cài dependency
Mở CMD/PowerShell:

```powershell
cd "C:\kas-hotels (2)"
npm install
```

## 3. Chạy server
```powershell
npm start
```

## 4. Các giao diện
- Khách: http://localhost:3000/index.html
- Danh sách 8 khách sạn: http://localhost:3000/hotels.html
- Trang giá + ảnh tham khảo: http://localhost:3000/reference
- Admin upload ảnh: http://localhost:3000/admin

## 5. Luồng khách
index.html → chọn khách sạn + ngày → Search rooms → hotel-detail.html → lướt tới hạng phòng → Select room → room-detail.html → xem tất cả ảnh đã upload + tiện ích + giá KAS đúng ngày → Book this room → thông báo liên hệ Zalo 0869768885.

Giá không cộng VAT và không cộng service charge.
