# KAS Hotel Collection — bản có upload ảnh + link tham khảo công khai

Phiên bản này vẫn giữ website KAS hiện tại, nhưng bổ sung **2 màn hình mới**:

- `admin.html` / `/admin` — quản trị viên upload ảnh phòng theo **chi nhánh → STT/Ez → hạng phòng**.
- `reference.html` / `/reference` — link công khai cho khách **chọn ngày, xem ảnh phòng và giá**, tuyệt đối **không có nút Book/đặt phòng**.

## 1. Cấu trúc quan trọng

```text
kas-hotels/
├─ admin.html                 ← GIAO DIỆN UPLOAD ẢNH
├─ reference.html             ← LINK KHÁCH THAM KHẢO, KHÔNG BOOK
├─ server.js                  ← backend Express + API upload
├─ data/
│  └─ rate-sheet.json         ← 8 bảng giá đã nhập đúng theo ảnh
├─ uploads/
│  ├─ .gitkeep
│  └─ manifest.json           ← tự tạo sau lần upload đầu tiên
├─ js/
│  ├─ rates.js                ← source of truth cho giá
│  ├─ reference.js
│  └─ admin.js
├─ Dockerfile
└─ render.yaml
```

### Cách upload ảnh

1. Chạy server: `npm install` rồi `npm start`.
2. Mở `http://localhost:3000/admin`.
3. Nhập `ADMIN_KEY`.
4. Chọn đúng **chi nhánh** và **hạng phòng**.
5. Chọn nhiều ảnh JPG/PNG/WEBP → `Upload ảnh`.
6. Ảnh được lưu vào `uploads/<hotelId>/<STT>/` và manifest được cập nhật.
7. Mở `http://localhost:3000/reference` để kiểm tra. Không cần nhập giá bằng tay.

## 2. Giá đã được sửa theo 8 ảnh bảng giá

Đã nhập đủ 8 chi nhánh:

| CN | Địa chỉ | Số hạng phòng trong bảng | Trạng thái |
|---|---|---:|---|
| 01 | 05 Trương Định | 3 | Đúng bảng ảnh |
| 02 | 260 Lý Tự Trọng | 8 | Đúng bảng ảnh |
| 03 | 47A Nguyễn Trãi | 4 | Đúng bảng ảnh |
| 04 | 170–172–174 Nguyễn Thái Bình | 6 | Đúng bảng ảnh |
| 05 | 278 Lê Thánh Tôn | 6 | Đúng bảng ảnh |
| 06 | 40–42 Bùi Thị Xuân | 9 | Đúng bảng ảnh |
| 07 | 13 Bùi Thị Xuân | 6 | Đúng bảng ảnh |
| 08 | 191 Lê Thánh Tôn | 6 | Đúng bảng ảnh |

Mỗi hạng phòng có 6 mức giá: Jul–Sep / October / Nov–Dec–Jan 2027 × weekday / weekend.
Thứ 6–CN được tính cuối tuần; T2–T5 được tính trong tuần.

**Chính sách chung từ bảng:** giá không bao gồm ăn sáng; phụ thu người lớn vượt tiêu chuẩn `300.000đ/người/đêm`; trẻ 3–12 tuổi `150.000đ/người/đêm`.

## 3. Một điểm rất quan trọng về ảnh

Upload ảnh ở `admin` **không làm thay đổi giá**. Giá đã được khóa theo `hotelId + STT` của bảng giá. Vì vậy khi bạn upload ảnh cho `hotel-04 / STT 5`, ảnh đó tự xuất hiện đúng cạnh hạng phòng STT 5 và hệ thống tự tính giá theo ngày được khách chọn.

Điều này tránh lỗi kiểu “upload ảnh phòng A nhưng lại lấy giá phòng B”.

## 4. Link cho khách

Sau khi deploy, link duy nhất cần gửi khách là:

```text
https://TEN-MIEN-CUA-BAN/reference
```

Khách có thể:

- chọn ngày nhận / trả phòng;
- xem tổng tiền theo đúng các đêm;
- xem chi tiết giá từng đêm và phân biệt trong tuần/cuối tuần;
- xem ảnh phòng đã upload;
- xem tất cả 8 chi nhánh;
- **không thể đặt phòng từ trang này**.

## 5. Chạy trên máy tính nội bộ

```bash
npm install
```

Windows PowerShell:

```powershell
$env:ADMIN_KEY="doi-key-nay"
npm start
```

Sau đó mở:

- Admin: `http://localhost:3000/admin`
- Khách: `http://localhost:3000/reference`

Nếu chỉ cần các thiết bị cùng mạng Wi-Fi truy cập, dùng IP LAN của máy chạy server, ví dụ:

```text
http://192.168.x.x:3000/reference
```

Đây chỉ là link nội bộ. Muốn khách ở bất kỳ đâu truy cập được thì phải deploy server lên Internet.

## 6. Deploy public — lưu ý quan trọng

Bản mới **không còn là static-only** vì upload ảnh cần backend và storage bền vững. Không dùng GitHub Pages/hosting static-only cho chức năng upload.

Khuyến nghị deploy một Node/Docker service trên host có **persistent disk/volume** được mount vào `/app/uploads`.

`Dockerfile` và `render.yaml` đã được chuẩn bị sẵn. Khi deploy, đặt biến môi trường:

```text
ADMIN_KEY=<một-key-mạnh-do-bạn-tự-đặt>
```

Sau khi deploy, mở `/admin` để upload. Link khách là `/reference`.

### Tại sao phải có persistent disk?

Ảnh upload phải tồn tại sau restart/redeploy. Nếu dùng filesystem tạm thời của một serverless/static platform, ảnh có thể biến mất. Vì vậy thư mục `/app/uploads` phải nằm trên volume/disk persistent.

## 7. Kiểm tra trước khi bàn giao

```bash
npm run build
```

Build hiện đã kiểm tra:

- đủ 8 chi nhánh;
- đủ dữ liệu giá;
- JS không lỗi syntax;
- không còn room thiếu giá trong dataset frontend;
- không có ảnh bị dùng chéo giữa các chi nhánh;
- có đủ `reference.html` và `admin.html`.

## 8. Bảo mật upload

- Upload cần `ADMIN_KEY`.
- Chỉ nhận JPG/PNG/WEBP.
- Mỗi file tối đa 10 MB.
- Tối đa 10 ảnh mỗi lần upload.
- Khách public không có API upload.
- Không đặt `ADMIN_KEY` vào frontend public.
