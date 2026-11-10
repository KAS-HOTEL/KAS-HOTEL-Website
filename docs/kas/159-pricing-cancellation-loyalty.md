# 159 — Giá đặt phòng, huỷ phòng & hoàn tiền, voucher, điểm KAS

Cập nhật: 10/11/2026. Nhánh `feat/booking-tax-voucher`. Tài liệu này ghi lại quy tắc đang chạy trong code và các điểm còn chờ chủ sản phẩm quyết định.

## 1. Giá một đặt phòng

Thứ tự tính (theo offers.html#member, quyết định chủ sản phẩm 09/11/2026):

1. **Tiền phòng**: tổng giá các đêm × số phòng.
2. **Voucher**: tối đa 1 voucher, trừ vào tiền phòng.
3. **Ưu đãi thành viên**: chỉ khi khách **đăng nhập** và có membership ACTIVE, hạng ACTIVE và chính sách giảm giá ACTIVE. Mức giảm lấy từ `membership_tier.discount_percent` (hiện là 10% cho mọi hạng), tính trên số tiền còn lại sau voucher.
4. **VAT 8%**: tính trên tiền phòng sau voucher và ưu đãi thành viên. Cấu hình ở bảng `tax_rule`; V62 tạo một dòng VAT 8% chung cho mọi khách sạn. **Không có phí dịch vụ.**
5. **Điểm KAS**: 1 điểm = 1 VND, chỉ trừ vào phần tiền phòng, không trừ vào thuế. Được dùng tối đa `maximum_redeem_percent` (50%) của tiền phòng sau ưu đãi, và không vượt số điểm khả dụng.

Tổng = tiền phòng − voucher − ưu đãi thành viên + VAT − điểm. Số tổng này được lưu vào `reservation.total_minor`. Email thanh toán và SePay dùng đúng số này.

Snapshot lưu theo từng đơn, không thay đổi khi khách lên hoặc xuống hạng sau đó:
- `reservation`: `discount_minor` (phần voucher), `tax_minor`, `voucher_id`, `price_snapshot` (`discount`, `taxes`).
- `reservation_loyalty_snapshot`: hạng, % và số tiền giảm thành viên, tỷ lệ tích điểm, số điểm đã dùng.

API:
- `POST /api/v1/public/request-pricing/quote`: nhận thêm `offerCode` và `pointsToUse`. Trả về `discount`, `voucher`, `taxes[]`, `member` (`discount`, `pointsAvailable`, `pointsUsed`, `pointsMaxForStay`).
- `POST /api/v1/public/request-pricing/vouchers`: danh sách voucher kèm số tiền tiết kiệm, hoặc lý do chưa dùng được.
- Mã lỗi: `VOUCHER_<lý do>` và `POINTS_<lý do>` (`OVER_LIMIT`, `OVER_BALANCE`, `BELOW_MINIMUM`, `NOT_A_MEMBER`, `REDEMPTION_OFF`).

## 2. Voucher: chỉ tính đã dùng khi đã thanh toán (V65)

- Khi tạo đơn: **giữ chỗ** một lượt (`voucher_hold`). Lượt giữ chỗ được tính vào giới hạn tổng và giới hạn mỗi khách (có khoá dòng voucher), nhưng `used_count` chưa tăng.
- Khi thanh toán được xác nhận (nhân viên, link email hoặc SePay IPN): giữ chỗ chuyển thành `voucher_redemption` và `used_count` tăng **một lần**. IPN gửi lặp không cộng thêm.
- Đơn kết thúc mà chưa thanh toán, hoặc quá 12:00 ngày nhận phòng: giữ chỗ được trả lại (quét 5 phút một lần).
- Đơn đã thanh toán rồi bị huỷ: **không** trả lại lượt voucher.

## 3. Huỷ phòng (V63, V64)

**Thời hạn huỷ miễn phí** (backend quyết định, theo giờ khách sạn, đúng mốc thì đã hết hạn):
- Thành viên KAS **tại thời điểm đặt** (`member_eligible_at_booking`): đến 12:00 ngày nhận phòng.
- Khách còn lại: trước giờ nhận phòng của khách sạn 24 giờ.
- Huỷ trực tuyến đóng lúc 12:00 ngày nhận phòng với mọi khách.

**Luồng huỷ:**
- **Trong hạn, chưa thanh toán**: huỷ ngay.
- **Trong hạn, đã thanh toán**: Super Admin xem xét trước (quy tắc chủ sản phẩm ngày 07/11, xem câu hỏi Q1).
- **Quá hạn, có cấu hình phí** (Console → Giá phòng → Phí huỷ phòng): khách thấy tiền đã trả, phí huỷ và số tiền dự kiến hoàn lại, và phải xác nhận. Nếu phí đổi sau khi khách đã xem, yêu cầu bị từ chối (`FEE_CHANGED`).
- **Quá hạn, chưa cấu hình phí**: Super Admin xem xét và tự báo phí. Hệ thống không tự đoán phí.
- **Khách xác nhận, đơn đã thanh toán**: đơn huỷ, chuyển sang `REFUND_PENDING`, Super Admin nhận email.
- **Super Admin xử lý hoàn tiền**: hoàn tiền ngoài hệ thống, rồi ghi nhận số tiền, thời điểm, mã tham chiếu (`REFUNDED`), hoặc ghi lý do không hoàn (`REFUND_REJECTED`). Khách chỉ nhận email "đã hoàn tiền" sau khi Super Admin ghi nhận. KAS không tự hoàn tiền qua SePay.

**Khách không đăng nhập**: nhập mã đặt phòng và email, KAS gửi link dùng một lần tới đúng email của đặt phòng (câu trả lời luôn giống nhau, có giới hạn tần suất). Trên trang của link, khách xem phí và xác nhận hoặc giữ đặt phòng.

API:
- `GET /api/v1/me/stays/{ref}/cancel/preview`
- `POST /api/v1/me/stays/{ref}/cancel` (body `expectedFeeMinor`)
- `POST /api/v1/public/cancellations/link`
- `/api/v1/admin/cancellation-fees` (quyền `rate.manage`)
- `/api/v1/admin/ops/reservations/cancellation-requests/refunds[/{id}/record|reject]` (quyền `payment.record`)

## 4. Điểm KAS

- **Dùng điểm**: giữ điểm khi tạo đơn (`cashback_hold`, `reserved_points`). Trừ điểm khi thanh toán được xác nhận (một bút toán REDEEM cho mỗi đơn). Trả lại phần giữ khi đơn kết thúc mà chưa thanh toán.
- **Huỷ sau khi đã thanh toán**: điểm đã dùng được trả lại bằng bút toán REVERSAL. Tác vụ hết hạn điểm coi phần này là chưa dùng, nên điểm giữ nguyên hạn cũ.
- **Tích điểm**: khi Super Admin xác nhận trả phòng của một đơn **đã thanh toán**. Tỷ lệ là của hạng tại thời điểm đặt (Classic 0%, Gold 2%, Platinum 5%), tính trên tiền phòng thực trả (sau voucher, ưu đãi thành viên và điểm; không gồm thuế), làm tròn xuống. Hoàn tác trả phòng thì thu hồi.
- Mọi bút toán có khoá idempotency (`REDEEM:`, `EARN:`, `REVERSAL:…`), nên webhook hoặc retry không cộng hay trừ trùng.

## 5. Câu hỏi chờ chủ sản phẩm

1. **Q1 — Đơn đã thanh toán, huỷ trong hạn miễn phí**: giữ quy tắc 07/11 (Super Admin xem xét trước) hay huỷ ngay rồi chờ hoàn tiền?
2. **Q2 — Cơ sở tính phí huỷ theo %**: hiện tính trên tổng tiền đặt phòng (đã gồm VAT). Có muốn tính trên tiền phòng trước thuế không?
3. **Q3 — Đơn chưa thanh toán bị huỷ quá hạn**: KAS không thu được phí, nên phí chỉ được ghi nhận. Có cần quy trình thu phí không?
4. **Q4 — Hạn dùng điểm**: trang chính sách ghi "3 tháng từ khi cộng", còn database (trigger V33) đang tính theo quý. Áp dụng theo bên nào?
5. **Q5 — Thời điểm trừ điểm**: trang chính sách ghi "giữ khi xác nhận, trừ sau khi trả phòng và đã thanh toán đủ". Yêu cầu mới ghi trừ khi thanh toán. Code đang **trừ khi thanh toán**.
6. **Q6 — VAT và điểm**: VAT hiện tính trước khi trừ điểm (điểm không trả thuế). Kế toán có đồng ý không?
7. **Q7 — Voucher hiển thị công khai**: mọi voucher ACTIVE đều hiện cho mọi khách. Có cần cờ "chỉ thành viên" hoặc "voucher riêng" không?
8. **Q8 — Hoàn tiền sau khi đã tích điểm**: hiện chưa có luồng (huỷ sau khi trả phòng là không thể). Nếu sau này cho hoàn tiền một phần thì cần quy tắc thu hồi điểm.
