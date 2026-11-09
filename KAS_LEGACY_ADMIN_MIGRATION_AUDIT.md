# KAS — Rà soát Admin legacy cần chuyển khỏi Node/JSON

**Ngày rà soát:** 20/10/2026  
**Phạm vi:** `frontend/server.js`, `frontend/js/admin.js`, các file JSON/runtime và các route Next.js/Backend hiện có. Đây là kiểm kê; chưa xóa, tắt hoặc di chuyển dữ liệu legacy.

## Kết quả

| Chức năng legacy | Lưu trữ/cách xác thực cũ | Đường thay thế hiện có | Việc còn lại |
|---|---|---|---|
| Catalog khách sạn/phòng đọc public (`GET /api/catalog`) | `frontend/js/data.js` và dữ liệu giá JSON | Next.js dùng public catalog/availability APIs; Backend có property, room type, rates | Đối chiếu từng trường và nguồn giá trước khi coi hai bộ dữ liệu tương đương. Không nhập giá tham khảo tự động. |
| Chỉnh rate theo mùa (`PUT /api/admin/room-rates`) | JSON/runtime; xác thực bằng `x-admin-key` | Next.js có rate grid/rate rules và `/admin/rates/*` | Cấu trúc legacy theo mùa không tương đương rate grid/date rules. Cần Operations xác nhận giá còn hiệu lực trước khi chuyển. |
| Ảnh property/room (`/api/admin/property-images`, `/upload`, `/image-url`) | Thư mục `uploads/`, manifest và URL overrides | Next.js Partner có quản lý media; Backend có media links và upload signed URL | R2 chưa được cấu hình đầy đủ; đối chiếu file, quyền sử dụng, cover và thứ tự trước khi nhập. |
| Ảnh site/collection (`/api/admin/site-image`, `/collection-image`) | JSON/runtime + file upload; `site-image-slots.json` | Chưa thấy màn quản lý nội dung/slot toàn site trong Next.js | Cần quyết định vị trí lưu mới và chủ sở hữu nội dung; không chuyển slot hoặc ảnh chưa xác minh. |
| Trạng thái quản trị (`/api/admin/status`) | Key tĩnh `ADMIN_KEY`; môi trường localhost có nhánh cho phép không cần key | Next.js có đăng nhập cookie, CSRF và phân vùng `/admin`, `/partner` | Không dùng legacy login làm cơ chế xác thực của sản phẩm mới. Chưa tắt legacy server vì còn route/trang cũ đang dùng. |

## Phân loại để triển khai an toàn

1. **Có đường thay thế ở Backend/Next.js:** property, phòng, giá/tồn, gallery/media của khách sạn, chính sách, facilities và experiences. Vẫn cần đối chiếu dữ liệu trước khi bỏ nguồn JSON.
2. **Chưa có màn thay thế toàn site:** ảnh trang chủ, ảnh collection và quản trị các slot nội dung legacy.
3. **Không được tự động nhập:** giá cũ, dữ liệu review/rating, ảnh không rõ quyền và thông tin vận hành chưa được người phụ trách xác nhận.
4. **Chưa gỡ `frontend/server.js` hoặc `frontend/js/admin.js`:** thay thế từng luồng, kiểm chứng dữ liệu, rồi mới lên kế hoạch ngừng phục vụ bản legacy.

## CMS slot ảnh — đã triển khai phần chuyển mới

- PostgreSQL đã có `site_page`, `site_page_translation`, `site_content_block` và bản dịch block từ V33; chưa có API/controller và màn Next.js để quản lý chúng.
- Enum `media_owner_type` đã có `PAGE_BLOCK`, nhưng API media hiện chỉ nhận `PROPERTY`/`ROOM_TYPE` vì hai loại đó mới kiểm tra được scope. Không thể gắn ảnh trang public vào CMS qua media API hiện tại.
- `site-image-slots.json` có **53 slot**: home 7, guidebook 26, homeHero 12, pageHero 6, Find Your KAS 2. V39 bổ sung trường URL hiện hành; API mới đọc/ghi danh mục và API public trả các slot đang bật.
- Next.js có trang `/admin/content/images` và điều hướng “Ảnh website”. Trang quản trị đủ 53 slot, nhóm theo nguồn cũ, hỗ trợ đổi URL HTTPS/đường dẫn cùng nguồn, bật/tắt slot và phục hồi ảnh mặc định khi để trống URL. Chỉ GLOBAL scope được quản lý; thao tác được ghi audit.
- V39 đã được Flyway áp dụng vào PostgreSQL local. Danh mục có đủ 53 slot; trong đó 40 URL override trùng key với danh mục mới đã được nạp. Có 13 slot không nhận URL override: chúng giữ ảnh mặc định hoặc không có ảnh dự phòng. Bảy key override cũ không còn trong danh sách 53 slot (các biến thể ảnh Guidebook) vẫn nằm nguyên trong JSON legacy để đối chiếu; không tự gộp ảnh vào slot khác.
- API public mới phục vụ danh sách slot, nhưng các trang Next.js chưa dùng các slot cũ để dựng lại giao diện. Các trang Guidebook cũ cũng chưa được chuyển thành route Next.js; đây vẫn là phần cần hoàn thiện nếu mục tiêu là ngừng toàn bộ website HTML/Node cũ.
- Đã chuyển nội dung Guidebook VI/EN thành `/{locale}/guidebook`, nối menu và API slot public. Bảo toàn 40 bài, bốn nhóm, thông tin tham khảo/khoảng cách và nguồn dẫn; 25 key ảnh bao phủ các địa điểm lặp. PostgreSQL hiện có URL cho 19/26 slot Guidebook; các slot thiếu ảnh hiển thị chỗ trống có nhãn thay vì tự chọn ảnh không rõ quyền. Cần kiểm tra trực quan trên trình duyệt trước khi chuyển hướng/tắt trang HTML cũ.
- Luồng upload nhị phân chưa chuyển: kho media hiện tại bắt buộc mỗi ảnh thuộc một partner và R2 chưa được cấu hình đầy đủ. CMS mới hiện nhận HTTPS URL/đường dẫn cùng nguồn; không tự gán ảnh website vào thư viện của một khách sạn.

## Kết luận checklist

Next.js đã là frontend chuẩn cho sản phẩm mới. Quản lý đủ 53 slot ảnh website đã có trang/API và bản chuyển 47 URL override trong V39; cần áp dụng Flyway V39, xác nhận ảnh trên runtime mới và chuyển luồng upload/lưu trữ. Các route Guidebook chưa được dựng lại nên chưa thể tắt các trang HTML/Node legacy.
