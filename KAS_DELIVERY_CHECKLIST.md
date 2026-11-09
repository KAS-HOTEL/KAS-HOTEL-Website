# KAS — Checklist hoàn thiện Frontend và Backend

## Quyết định ưu tiên 24/10/2026 — không tồn phòng

Website không lưu/nhận dữ liệu tồn phòng. Admin tự kiểm tra thủ công bên ngoài website. Các mục lịch sử bên dưới về inventory, hold, buffer, sửa tồn, tự động kiểm tra/trừ/hoàn tồn đã bị thay thế; không thực hiện lại. Giữ mô tả phòng, sức chứa, số lượng yêu cầu và giá. Xem `docs/kas/153-owner-decision-no-website-inventory.md` và `KAS_NO_STOCK_CHANGELOG_2026-10-24.md`. Public pricing dùng `/api/v1/public/request-pricing`.


Checklist này tổng hợp các việc còn lại dựa trên trạng thái repo được rà soát ngày 20/10/2026. Đánh dấu `[x]` khi có bằng chứng hoàn thành; ghi người phụ trách và ngày ở cuối mỗi mục nếu cần.

## P0 — Gỡ các chặn để có thể đưa dữ liệu và luồng chính vào hoạt động

- [ ] **Chốt dữ liệu sản phẩm còn thiếu**: taxonomy bốn intent và mapping ban đầu từ frontend đã được lưu trong PostgreSQL local qua V38; V33 đã có amenity EN/VI và assignment phòng. Còn xác minh claim thực tế, rà soát điều khoản hủy và chờ Admin khách sạn cung cấp chính sách no-show chính thức.
  - Find Your KAS trên trang chủ và trang danh sách Next.js đọc taxonomy/assignment từ API; Partner có thể gán nhiều nhóm cho khách sạn trong hồ sơ. Lựa chọn được giữ khi áp dụng bộ lọc/tìm ngày.
  - Luồng chính sách no-show đã có trong Backend và màn hình Partner: Admin khách sạn tự soạn nội dung VI/EN, lưu bản nháp và kích hoạt sau khi đủ hai ngôn ngữ. Hệ thống không tự đặt mức phí hay điều khoản; dữ liệu chính thức vẫn chờ Admin cung cấp.
  - Hoàn thành khi claim thực tế được xác minh, điều khoản hủy được duyệt và Admin khách sạn cung cấp quy định no-show cụ thể.
- [ ] **Bổ sung dữ liệu địa điểm cho 8 khách sạn**: đã đồng bộ địa chỉ từ frontend hiện có. Theo quyết định không cần Google Maps, chưa thu thập hoặc suy đoán latitude/longitude; chỉ mở lại phần tọa độ nếu sản phẩm cần hiển thị bản đồ.
  - Bảng địa chỉ và nguồn frontend: [KAS_PROPERTY_COORDINATES_INTAKE.csv](KAS_PROPERTY_COORDINATES_INTAKE.csv). Phần địa chỉ hoàn tất; phần tọa độ được hoãn vì hiện không cần tích hợp Google Maps.
- [x] **Bổ sung đường quản lý tọa độ trong sản phẩm**: form thông tin property Next.js, PATCH Backend, kiểm tra giới hạn vĩ/kinh độ và optimistic version đã có.
  - Đây là nhập tọa độ thủ công; chưa có bản đồ chọn điểm/geocoder. Đường ghi đã có, dữ liệu 8 điểm vẫn chờ Operations xác minh rồi nhập.
- [ ] **Nhập và duyệt dữ liệu public tối thiểu** cho khách sạn/phòng/tiện nghi/chính sách/media; xác nhận trạng thái publish và tính đầy đủ theo quy tắc hiện hành.
  - Đã rà nguồn frontend cũ: baseline hiện có 8 khách sạn, 48 loại phòng cùng danh sách tiện nghi; `frontend/js/data.js` còn có mô tả, thông số phòng, giá tham khảo và đánh giá với nguồn khác nhau. Đây là dữ liệu tham khảo frontend, chưa được xác nhận đồng loạt là dữ liệu vận hành chính thức.
  - Bản rà soát để Admin đối chiếu: [KAS_PUBLIC_CONTENT_REVIEW.md](KAS_PUBLIC_CONTENT_REVIEW.md). Chưa có dữ liệu nào được nhập hoặc xuất bản.
  - Chưa nhập hoặc xuất bản: cần Admin/đơn vị phụ trách xác nhận thông tin phòng, tồn phòng, giá còn hiệu lực, nội dung chính sách, quyền sử dụng ảnh và điều khoản no-show. Không chuyển rating/review hoặc ảnh bên thứ ba thành dữ liệu public nếu chưa xác nhận nguồn/quyền.
  - Hoàn thành khi dữ liệu thật được duyệt, nhập qua luồng sản phẩm và trang public hiển thị đủ theo điều kiện publication; không chỉ dựa trên số liệu trong frontend cũ.
- [ ] **Áp dụng và xác minh migration qua Flyway trên môi trường tích hợp/staging**; V33–V39 hiện đã có trên PostgreSQL local. V36–V39 đã được Flyway áp dụng ngày 20/10/2026; API public trip-intents đã trả đủ bốn nhóm. Staging vẫn chưa cấu hình/chưa migrate.
  - Hoàn thành cho staging khi có backup, ghi nhận phiên bản schema, ứng dụng khởi động và API liên quan hoạt động với schema mới.

## P1 — Hoàn tất nối Frontend Next.js với Backend

- [x] **Xác định Next.js là frontend chuẩn cho sản phẩm mới**: Next.js App Router là giao diện sản phẩm cần tiếp tục phát triển; `frontend/js` cũ chỉ là nguồn tham chiếu cho nội dung/nhóm đã được đối chiếu, không phải nơi thêm luồng mới. Dữ liệu vận hành tiếp tục lấy từ Backend.
- [x] **Lập ma trận màn hình → API** cho public, partner và admin; đã ghi rõ API đã nối, quyền/phạm vi, tình trạng dữ liệu và khoảng trống còn lại trong [KAS_FRONTEND_API_MATRIX.md](KAS_FRONTEND_API_MATRIX.md). Các luồng ghi của Partner/Admin và những mục phụ thuộc cấu hình/dữ liệu vẫn cần smoke test riêng.
- [x] **Đối chiếu endpoint với Next.js**: lời gọi API ứng dụng đi qua `lib/api/client.ts`; chỉ còn các `fetch` có chủ đích cho CSRF và signed-URL upload. Không thấy `localStorage`/`sessionStorage` hay gọi thẳng server Node cũ trong mã production Next.js. Khoảng trống endpoint và màn hình được ghi trong [KAS_FRONTEND_API_MATRIX.md](KAS_FRONTEND_API_MATRIX.md); các API chưa có vẫn được giữ là khoảng trống, không giả lập.
- [x] **Đưa “Find Your KAS” vào Next.js** theo bốn intent hiện có; dữ liệu nhóm/khách sạn nay đọc từ API Backend, mapping ban đầu giữ theo frontend cũ và Partner có thể gán một hoặc nhiều nhóm cho khách sạn mới.
- [ ] **Chuyển các chức năng quản trị còn dùng JSON/Node sang API Backend**: đã kiểm kê API legacy trong [KAS_LEGACY_ADMIN_MIGRATION_AUDIT.md](KAS_LEGACY_ADMIN_MIGRATION_AUDIT.md). Quản lý đủ 53 slot ảnh website đã có API Backend, route public và màn Next.js `/admin/content/images`; Flyway V39 đã chạy ở PostgreSQL local. Có 40 URL override khớp key được nhập, 13 slot chưa có URL khớp và bảy key Guidebook cũ được giữ nguyên trong JSON để đối chiếu. Guidebook VI/EN đã chuyển thành `/{locale}/guidebook`, giữ 40 bài/bốn nhóm và đọc ảnh qua public API; hiện có URL cho 19/26 slot Guidebook. Còn kiểm tra trực quan, bổ sung ảnh còn thiếu, cấu hình kho file nếu cần upload trực tiếp và xác nhận trước khi tắt các trang/handler legacy.
- [ ] **Kiểm tra đăng nhập, CSRF, cookie phiên và phân quyền** cho CUSTOMER, ADMIN, SUPER_ADMIN và partner trên các luồng tương ứng.
- [ ] **Hoàn tất xử lý trạng thái UI cho mọi luồng API**: tải, rỗng, lỗi, hết phiên và không đủ quyền; nội dung EN/VI nhất quán.
- [ ] **Kiểm tra map khóa dữ liệu**: `frontend_key` dùng cho URL/hiển thị; UUID dùng cho thao tác quản trị; `branch_code` dùng đúng vai trò mã đặt chỗ.
- [ ] **Xác nhận Trip.com rating là cập nhật thủ công** và có quy trình người chịu trách nhiệm; không bật tự động nếu chưa có feed/credential phù hợp.

## P1 — Chất lượng backend và vận hành

- [ ] **Chạy đầy đủ backend tests** trên môi trường có Maven local repository và database test khả dụng; lưu lại kết quả.
- [ ] **Rà soát migration và dữ liệu hiện hữu** trước/sau V33; kiểm tra constraint, idempotency, quyền truy cập và các tác vụ định kỳ.
- [ ] **Kiểm tra tích hợp end-to-end** cho đăng ký/đăng nhập khách hàng, tìm khách, review moderation, voucher và cập nhật rating.
- [ ] **Kiểm tra cấu hình môi trường**: database, session/security secrets, CORS/proxy, mail, object storage/R2, logging và health/readiness.
- [ ] **Xác nhận chính sách dữ liệu và quyền**: customer consent, marketing opt-in, audit log và giới hạn truy cập dữ liệu nhạy cảm.

## P2 — Kiểm chứng frontend và trải nghiệm

- [ ] **Khôi phục dependency frontend đúng lockfile** rồi chạy typecheck, lint, unit tests và production build; lưu kết quả CI.
- [ ] **Kiểm tra luồng đặt yêu cầu lưu trú đầu-cuối** từ danh sách khách sạn tới gửi yêu cầu, xác nhận và tra cứu yêu cầu.
- [ ] **Kiểm tra partner/admin workflows** trên desktop và mobile: tạo/sửa khách sạn, phòng, giá, tồn kho, media, đặt phòng và hội thoại.
- [ ] **Kiểm tra song ngữ EN/VI**, khả năng truy cập bàn phím/nhãn form, lỗi tải ảnh và responsive trên các kích thước màn hình mục tiêu.
- [ ] **Kiểm tra dữ liệu thực trên môi trường staging**; không dùng dữ liệu demo để kết luận luồng production đã sẵn sàng.

## P2 — Phát hành

- [ ] **Chốt môi trường staging và production**, domain, HTTPS, biến môi trường và quyền truy cập triển khai.
- [ ] **Thiết lập CI/CD** chạy kiểm tra frontend/backend và migration validation trước khi phát hành.
- [ ] **Thực hiện smoke test sau deploy**: health, đăng nhập, public catalog, partner/admin, tạo yêu cầu lưu trú và log lỗi.
- [ ] **Chuẩn bị giám sát và vận hành**: cảnh báo lỗi, backup database, khôi phục thử, người trực xử lý và hướng dẫn rollback.
- [ ] **Chốt tiêu chí go-live** với chủ sản phẩm và người vận hành; ghi nhận các mục được chấp nhận để làm sau launch.

## Ghi chú trạng thái hiện tại

- README tài liệu còn ghi bước mới nhất là **Step 16A.44**, nhưng mã hiện tại đã có thêm phần trải nghiệm đặc trưng. Cần đồng bộ tài liệu/changelog với mã trước khi xem số bước là nguồn trạng thái duy nhất.
- Frontend có hai nhánh cần phân biệt: Next.js mới và bản demo HTML/JS cũ.
- Mã Next.js đã có API proxy cùng các client cho auth, khách sạn/phòng, giá/tồn, media metadata, facilities, landmarks, experiences, reservations, sales, conversations và customer stays/cancellation. Các mục còn thiếu được ghi trong `frontend/src/lib/api/endpoints/index.ts`: public availability search, customer profile, upload bytes, public offers/content pages. Đây là các khoảng trống API/feature được ghi nhận, không phải lỗi kết nối tổng quát.
- Partner portal đã có màn nhập/sửa/xóa signature experiences; Backend có controller/service và điều kiện publish. V1 hiện chỉ nhập tiêu đề, mô tả tùy chọn, thứ tự; ảnh và thời điểm trong ngày nằm ngoài phạm vi. Không cần bỏ gate này trừ khi chủ sản phẩm đổi yêu cầu.
- Backend đã bổ sung liên kết reservation với tài khoản khách đăng nhập, snapshot membership, lịch sử `/me/stays` và quy trình huỷ miễn phí/quá hạn cần báo phí rồi chờ khách xác nhận. V35 đã áp dụng trên PostgreSQL local; API stays/cancellation cùng đăng nhập/đăng ký khách hàng đã nối vào Next.js tại `/{locale}/account`.
- Quy trình huỷ đã được cập nhật: yêu cầu chờ báo phí và báo giá chờ khách xác nhận hết hạn lúc 12:00 giờ Việt Nam ngày check-in; reservation vẫn còn hiệu lực. V36–V37 đã được Flyway áp dụng vào PostgreSQL local ngày 20/10/2026.
- Chính sách đăng nhập đã sửa theo quyết định chủ sản phẩm: không bắt buộc 2FA cho SUPER_ADMIN hoặc ADMIN ở V1; đăng nhập bằng email/mật khẩu và không cần migration riêng.
- “Find Your KAS” hiện đọc taxonomy và assignment qua API trên trang chủ, `/hotels` và bộ lọc intent; mapping ban đầu giữ theo frontend cũ. `npm run typecheck` qua ngày 20/10/2026.
- Backend có API taxonomy public, API gán nhóm có kiểm tra scope/audit, và giao diện quản lý nhóm trong hồ sơ Partner. Flyway V36–V38 đã áp dụng; backend khởi động thành công. Database health trả `UP`; endpoint public trả đủ bốn nhóm (family: 4, slow: 6, business: 5, long: 5).
- Backend compile và frontend typecheck đã qua; chưa chạy bộ kiểm thử hoặc xác minh các thao tác lưu từ giao diện Partner trên trình duyệt.
- PostgreSQL local `kas_web_dev` đã được backup và Flyway V35 áp dụng thành công ngày 19/10/2026; V36–V39 tiếp tục áp dụng ngày 20/10/2026. Migration staging và xác nhận quy trình backup/khôi phục ở staging vẫn còn mở.
- Repo đang có thay đổi chưa commit. Trước khi phát hành cần xác định các thay đổi nào là chủ ý và đưa vào quy trình review/commit phù hợp.
