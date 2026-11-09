# KAS — Ma trận màn hình Frontend và API Backend

## Quyết định ưu tiên 24/10/2026 — không tồn phòng

Website không lưu/nhận dữ liệu tồn phòng. Admin tự kiểm tra thủ công bên ngoài website. Các mục lịch sử bên dưới về inventory, hold, buffer, sửa tồn, tự động kiểm tra/trừ/hoàn tồn đã bị thay thế; không thực hiện lại. Giữ mô tả phòng, sức chứa, số lượng yêu cầu và giá. Xem `docs/kas/153-owner-decision-no-website-inventory.md` và `KAS_NO_STOCK_CHANGELOG_2026-10-24.md`. Public pricing dùng `/api/v1/public/request-pricing`.


**Rà soát:** 20/10/2026  
**Nguồn:** route Next.js, các wrapper trong `frontend/src/lib/api/endpoints`, controller Backend và hợp đồng API hiện có. Ma trận này ghi nhận việc nối trong mã nguồn; chỉ các dòng ghi rõ “đã gọi thực tế” mới được xem là kiểm chứng runtime.

## Luồng public và khách hàng

| Màn hình/luồng | API Backend | Truy cập | Trạng thái và giới hạn |
|---|---|---|---|
| Trang chủ `/{locale}` | `GET /public/properties`, `GET /public/trip-intents`, gallery | Public | Đã nối. Nhóm Find Your KAS và slug khách sạn lấy từ API; xác nhận runtime: đủ 4 nhóm, lần lượt có 4/6/5/5 khách sạn được hiển thị công khai. |
| Danh sách `/{locale}/hotels` | `GET /public/properties`, `/public/amenities`, `/public/trip-intents` | Public | Đã nối. Lọc intent theo assignment API; district/amenity được gửi lên Backend. Ngày lưu trú được giữ trên URL nhưng không lọc tình trạng còn phòng trong danh sách. |
| Chi tiết khách sạn | `GET /public/properties/{slug}`, `/room-types`, `/policies`, `/facilities`, `/gallery`, gallery phòng, `/public/availability/properties/{slug}` | Public | Đã nối. Chỉ trả dữ liệu được công khai theo trạng thái property/policy; kết quả còn phụ thuộc dữ liệu đã được khách sạn duyệt và xuất bản. |
| Báo giá và gửi yêu cầu đặt phòng | `POST /public/availability/quote`, reservation request; tra cứu theo reference | Public/không cần đăng nhập | Đã có các wrapper và route giao diện. Quote chỉ tính toán; request mới tạo yêu cầu lưu trú. Luồng còn phụ thuộc cấu hình giá/tồn phòng và điều kiện nghiệp vụ. |
| Đăng ký/đăng nhập khách | `/public/auth/*` | Public; phiên dùng cookie HttpOnly + CSRF | Đã nối vào các trang tài khoản; không dùng 2FA theo quyết định sản phẩm V1. |
| Tài khoản: kỳ lưu trú và hủy | `/me/stays`, `/me/stays/{reference}/cancel`, `/cancel/decision`, session endpoints | Khách đăng nhập | Đã nối. Quyền thao tác dựa trên tài khoản đã liên kết khi đặt phòng; hủy quá hạn chờ khách sạn báo phí và khách xác nhận. |
| City Guidebook `/{locale}/guidebook` | `GET /public/site-image-slots` | Public | Đã có hai ngôn ngữ, 40 bài trong bốn nhóm và dữ liệu ảnh lấy theo key CMS. Local DB có URL cho 19/26 slot Guidebook; các slot chưa có ảnh hiển thị placeholder. Nội dung và nguồn vẫn cần kiểm tra trực quan trước khi chuyển hẳn khỏi HTML cũ. |

## Partner và quản trị khách sạn

| Màn hình/luồng | API Backend | Quyền/phạm vi | Trạng thái và giới hạn |
|---|---|---|---|
| Danh sách, tạo và hồ sơ khách sạn | `/admin/properties`, `/{id}`, `/{id}/completeness`, `/{id}/trip-intents`, `/publish` | `property.manage`; scope khách sạn của tài khoản | Đã nối. Assignment Find Your KAS có kiểm tra scope và audit. Dữ liệu chỉ lên public theo quy trình publication. |
| Thông tin/phòng/tiện nghi | `/admin/properties/{id}`, `/room-types`, amenity và status routes | `property.manage` / `roomtype.manage`; scope khách sạn | Đã nối trong các màn hình Partner; điều kiện publish và version do Backend kiểm soát. |
| Chính sách, gồm NO_SHOW | `/admin/properties/{id}/policies`, `/translations`, `/status` | `property.manage`; scope khách sạn | Đã có màn hình. Admin khách sạn tự soạn VI/EN; cần đủ hai ngôn ngữ để kích hoạt. Backend không tự điền điều khoản; nội dung no-show chính thức vẫn chờ người phụ trách cung cấp. |
| Nội dung khách sạn: facilities, landmarks, experiences | `/admin/properties/{id}/facilities`, `/landmarks`, `/experiences` | `property.manage`; scope khách sạn | Đã nối. Ảnh và dữ liệu public vẫn cần kiểm tra quyền, độ chính xác và trạng thái publish. |
| Ảnh/media | `/admin/media`, upload-url, complete, links/usages | `media.upload`; publish cần quyền tương ứng | Mã UI/API dùng luồng signed URL; upload thật cần cấu hình object storage/R2. |
| Giá và lịch tồn | `/admin/rates/*`, `/admin/ops/inventory/*` | `rate.view/manage`, `inventory.view/adjust`; scope | Đã có wrapper và màn hình Partner. Chưa kiểm tra toàn bộ bằng tài khoản vận hành trên trình duyệt. |
| Yêu cầu lưu trú, reservation, hội thoại | `/admin/sales-requests/*`, `/admin/ops/reservations/*`, `/admin/ops/conversations/*`, message templates | Quyền vận hành tương ứng; scope khách sạn | Đã có route/wrapper cho queue, chi tiết và hội thoại. Một số thao tác nghiệp vụ còn cần smoke test đầu-cuối. |

## Admin/SUPER_ADMIN

| Màn hình/luồng | API Backend | Quyền/phạm vi | Trạng thái và giới hạn |
|---|---|---|---|
| Đăng nhập Admin và khu vực bảo vệ | auth/session | `SUPER_ADMIN` dùng global scope; `ADMIN` có scope theo phân công | Có route `/admin/login` và vùng `/admin` bảo vệ. Không bắt buộc 2FA. |
| Danh sách khách sạn và duyệt hồ sơ | property submissions/review routes | `property.manage`; global hoặc phạm vi được cấp | Có màn hình danh sách/duyệt. Luồng cần xác minh với tài khoản SUPER_ADMIN thật. |
| Ảnh website — đủ 53 slot | `GET/PATCH /admin/site-image-slots`, `GET /public/site-image-slots` | Quản lý cần `content.manage` và GLOBAL scope | CMS Next.js đã có ở `/admin/content/images`; V39 đã áp dụng local, 53 slot/40 URL hiện hành đọc được từ PostgreSQL. Hiện sửa bằng HTTPS URL/đường dẫn cùng nguồn; upload file trực tiếp chưa dùng được do chưa cấu hình R2. Các trang Next.js public chưa được map lại theo bộ slot legacy. |
| Duyệt đánh giá | `/admin/reviews` | Quyền moderation | Backend có API; chưa thấy màn hình Next.js tương ứng trong danh sách route hiện tại. |
| Voucher và cấu hình toàn nền tảng | một số API quản trị Backend | `SUPER_ADMIN` theo controller | Chưa thấy màn hình quản lý voucher/cấu hình tương ứng trong Next.js; cần tách việc “API có” khỏi việc “đã có giao diện”. |

## Khoảng trống xác định được

1. **Tìm khách sạn theo khả năng còn phòng trong toàn danh sách:** Backend chưa có `GET /public/availability/search` (OQ-122). Hiện ngày được giữ khi điều hướng; guest xem tình trạng phòng tại trang chi tiết từng khách sạn.
2. **Hồ sơ khách:** Backend có `GET /me/profile`, nhưng chưa có wrapper hoặc trang chỉnh sửa hồ sơ Next.js.
3. **Địa điểm:** Backend có `GET /public/locations`; chưa có wrapper/màn hình bản đồ. Sản phẩm đã quyết định hiện chưa cần Google Maps.
4. **Review moderation:** API có, màn hình Next.js chưa thấy.
5. **Voucher/cấu hình SUPER_ADMIN:** một số API có nhưng chưa có màn hình quản lý tương ứng; hiện chưa có bằng chứng về một dashboard SUPER_ADMIN bao phủ các chức năng này.
6. **Upload media:** giao diện Partner và signed-URL API có, nhưng upload thực tế phụ thuộc cấu hình R2/object storage. CMS 53 slot ảnh website hiện hỗ trợ đổi URL; chưa có kho lưu file global.
7. **Dữ liệu public:** điều khoản no-show và thông tin sản phẩm chính thức cần người phụ trách nhập/xác nhận; UI không tự suy đoán dữ liệu.

## Kiểm chứng đã thực hiện

- Backend `mvnw -DskipTests compile`: **BUILD SUCCESS**.
- Frontend `npm run typecheck`: **đạt**, gồm route Guidebook mới.
- PostgreSQL local `kas_web_dev`: Flyway đã áp dụng tới **V39**. V39 có 53 slot và 40 URL khớp key đã chuyển; chưa ghi nhận kiểm chứng API bằng HTTP trong lượt cập nhật CMS này.
- Gọi thực tế `GET /api/v1/public/trip-intents?locale=vi`: **200**, đủ bốn nhóm và mapping công khai như ghi ở trên.
- Rà mã production Next.js: API đi qua client dùng chung; các lệnh `fetch` còn lại chỉ phục vụ CSRF và tải file lên signed URL. Không tìm thấy `localStorage`/`sessionStorage` hay gọi trực tiếp server Node cũ.
- Chưa chạy automated tests; chưa xác minh mọi thao tác ghi của Partner/Admin trên trình duyệt.
