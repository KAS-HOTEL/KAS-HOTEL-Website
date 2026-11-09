# KAS — Frontend / Admin / Database Mapping Report (05/11/2026)

Xác định từ source code và kiểm chứng bằng dữ liệu chạy thật trên `kas_web_test` (8 khách sạn). "Website" = site HTML (`frontend/*.html`, `js/`); "Console" = Next.js `/admin`, `/partner`; "Admin cũ" = `admin.html` + `/api/admin/*` trong `server.js` (khoá `ADMIN_KEY`, lưu JSON trên disk).

## 1. Bảng mapping thực tế

| Thực thể | Nơi quản trị | Lưu ở đâu | Website đọc từ | Console đọc từ | Đồng bộ? |
|---|---|---|---|---|---|
| Khách sạn (tên, địa chỉ, mô tả) | Console `/admin/properties` (ADMIN) | `property`, `property_translation` | `js/data.js` (tĩnh) + `GET /api/catalog` (JSON disk) | `/api/v1/admin/properties` | **Một phần**: tên và số lượng khớp (8/8), nhưng sửa trên console không tự đổi website |
| Mã khách sạn | – | `property.slug` / `frontend_key` | id `hotel-01…08`, nối với slug qua `KAS_API_MAP` (`live.js: slugForHotel`) | slug / UUID | **Khớp** (kiểm chứng `hotel-03` → `kas-ancient-boutique-hotel`) |
| Loại phòng | Console room types | `room_type` | `data.js` + `KAS_API_MAP` (`h0X-rY` → slug) | API admin | **Khớp số lượng** 8/8: 3/8/4/6/6/9/6/6 |
| Giá phòng | Console giá (base, ngày, rule) | `rate_day`, `rate_rule` | `GET /api/v1/public/request-pricing/properties/{slug}` (`live.js`) + override `KAS_RATES` từ admin cũ | API admin | **Khớp** giá báo; vẫn còn nguồn override cũ (KAS-024) |
| Ảnh khách sạn / gallery | Admin cũ (upload → disk) **và** console media (R2) | `frontend/uploads` + `kas-config/*.json` (disk) **và** `media_asset`, `media_link` | `/api/catalog` + `js/images.js` (+ ảnh hotlink tripcdn) | `/api/v1/admin/media`, public gallery | **Không** — 2 hệ thống song song (KAS-013, High) |
| Ảnh hero / slot ảnh website | Console `/admin/content/images` (53 slot) và admin cũ | `site_image_slot` **và** JSON disk | `js/site-images.js` → `/api/catalog` (JSON disk) | `/api/v1/admin/site-image-slots` | **Không** — website không gọi `/public/site-image-slots` |
| Ảnh phòng | Admin cũ / console media | như trên | `data.js` / `/api/catalog` | media | Không (như trên) |
| Trip intents (Family, Slow, Business, Long) | Console `PATCH /admin/properties/{id}/trip-intents` | `trip_intent`, `property_trip_intent` (V38) | Trang chủ: link `find-your-kas.html?stay=…`; Find Your KAS: **danh sách cứng trong HTML** | API | **Khớp 4/4 nhóm hôm nay** (family 4, slow 6, business 5, long 5 khách sạn); rủi ro lệch khi admin đổi vì website không đọc API |
| Saved Hotels | Khách | `customer_favorite_property` (theo tài khoản) | `Store.loadSavedHotels` → `/api/v1/me/favorites` | – | **Khớp**; trạng thái tim đồng bộ trang chi tiết, danh sách (sau sửa QA-005), Saved Hotels |
| Hồ sơ / avatar khách | Khách; console `/admin/customers` | `customer`, `app_user` | `/api/v1/me/profile` | `/api/v1/admin/customers` | **Khớp** |
| Booking / yêu cầu | Khách gửi; console `/partner/requests` | `reservation`, `reservation_line`, `reservation_status_history` | `/api/v1/me/stays`, trang tra cứu | `/api/v1/admin/sales/requests`, `/ops/reservations` | **Khớp**: tổng tạm tính = subtotal = tổng dòng (KAS0588375: 2.700.000) |
| Hội viên (hạng, điểm) | – (chỉ xem) | `customer_membership`, `cashback_account` | `/me/profile` | `/admin/customers` | Hiển thị khớp; tích điểm chưa có (KAS-010) |
| Review | Console moderation | `review`, `review_moderation_event` | **Không đọc** (rating tĩnh trong `data.js`) | `/admin/reviews` | **Không** (KAS-009) |
| Trip.com rating | Console `PUT /admin/properties/{id}/trip-rating` | `trip_com_rating_quarterly_snapshot` | **Không đọc** (`/public/trip-ratings` có nhưng website không gọi) | API | **Không** |
| City Guide / Guidebook / After-dark | Không có quản trị (HTML tĩnh); ảnh qua slot `/api/catalog` | file HTML + JSON disk | tĩnh | – | N/A |
| Experiences (trang) | – | HTML tĩnh | tĩnh | Console quản lý experiences **theo khách sạn** (`property_experience`) — không phải trang Experiences | Không liên kết |
| Offers / Voucher | Console `/admin/vouchers` | `voucher` | `offers.html` tĩnh; đặt phòng từ chối `offerCode` (V1) | API | Không áp dụng (theo thiết kế V1) |

## 2. Kết quả kiểm thử mapping

| ID | Kiểm tra | Kết quả |
|---|---|---|
| TC-MAP-01 | Tên + số loại phòng 8 khách sạn website ↔ backend | **PASS** 8/8 |
| TC-MAP-02 | Saved Hotels: id website ↔ slug backend; tim đồng bộ giữa các trang | **PASS** (sau sửa QA-005) |
| TC-MAP-03 | Trip intents website ↔ DB | **PASS** hôm nay; rủi ro lệch (bản sao cứng) |
| TC-MAP-04 | Giá website = báo giá backend | **PASS** (trang chi tiết "từ 1.400.000" = API) |
| TC-MAP-05 | Booking: tổng website gửi ↔ DB | **PASS** |
| TC-MAP-06 | Admin đổi ảnh hero / ảnh khách sạn / thứ tự ảnh → website cập nhật | **FAIL (đã biết, KAS-013)**: website đọc ảnh từ admin cũ/JSON disk, không từ console |
| TC-MAP-07 | Admin đổi giá / deactivate khách sạn / room → website | **BLOCKED**: cần tài khoản staff test; về code: website đọc giá live từ API (sẽ đổi), danh sách khách sạn từ `data.js` (sẽ **không** ẩn khách sạn bị đóng trên console) |
| TC-MAP-08 | Ảnh hotel gallery không lẫn room gallery | **PASS** (API tách `/gallery` và `/room-types/{slug}/gallery`; IT `HeroCoverIntegrityIT`, `MediaCoversIT`) |

## 3. Rủi ro và đề xuất

1. **Một nguồn sự thật cho ảnh (High, KAS-013).** Chọn media + slot của Spring (đã có API, IT, R2) và cho website đọc `/api/v1/public/site-image-slots` và `/public/properties/{slug}/gallery`; chuyển dữ liệu admin cũ sang rồi tắt `admin.html`. Trước đó, mọi thay đổi ảnh phải làm trên **admin cũ** thì website mới thấy.
2. **Danh sách khách sạn và trip intents của website là bản sao tĩnh.** Nếu Admin đóng một khách sạn hoặc đổi nhóm chuyến đi trên console, website không đổi theo. Nên cho `hotels.html`, `find-your-kas.html` đọc `/public/properties` và `/public/trip-intents`.
3. Review và Trip.com rating đã có API nhưng website chưa dùng (KAS-009).
4. Không phát hiện mapping sai khách sạn, sai loại phòng hay ghi đè dữ liệu không liên quan.
