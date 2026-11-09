# KAS — Prompt giao việc cho Claude

Cập nhật 24/10/2026 theo snapshot `284d6a2` và thay đổi mới. Frontend đã qua 77 files / 1.426 tests. Các màn admin và URL ảnh đã được triển khai; dùng các prompt dưới để kiểm tra phần còn lại, không tạo lại phần đã có.

Mỗi task Kxx khớp [báo cáo/checklist](KAS_CODE_AUDIT_2026-10-24.md). Đọc [kết quả chuyển đổi admin](docs/kas/155-admin-console-migration.md) trước khi nhận K09/K11/K16/K17/K21/K22/K25.

**Quyết định ưu tiên:** doc152 (manual booking), doc153 no-website-inventory, doc154 shared-admin-account. Một SUPER_ADMIN dùng chung bằng email/mật khẩu; không staff key-login, không partner signup. QD-A đã chốt URL HTTPS và giữ R2; QD-B giữ admin cũ đến khi đối chiếu; QD-C chỉ chuyển ghi chú/log, không xóa.

## Prompt nền — dùng ở đầu mỗi phiên

```text
Bạn làm việc trong C:\Users\Admin\Documents\Kas_Web_Full_backend_updated\Kas_Web_Full.
Đọc AGENTS.md/CLAUDE.md áp dụng, KAS_CODE_AUDIT_2026-10-24.md và quyết định nghiệp vụ liên quan trước khi sửa. Với Next.js, đọc guide local node_modules/next/dist/docs cho API sẽ thay đổi.
Kiểm tra git status; giữ nguyên thay đổi có sẵn, nhất là application-dev.yml và application.example.yml. Không in secret hoặc đọc .env để đưa nội dung vào báo cáo. Không reset/clean/xóa uploads/backup, không sửa migration đã áp dụng, không tự deploy/migrate DB thật/gửi email thật.
Staff dùng một tài khoản SUPER_ADMIN GLOBAL bằng email/mật khẩu cho cả hai console; CUSTOMER có tài khoản riêng. Partner self-registration đã rút. Không phục hồi staff key-login hoặc tạo/rotate/in mật khẩu thật, không chạy provisioning vào DB vận hành.
Source of truth là mã + quyết định sản phẩm mới nhất; tài liệu lịch sử/comment cũ có thể sai. Giữ manual hotel review: website không lưu/nhận tồn phòng; request/quote/confirm/cancel không đọc hoặc ghi tồn; chỉ hotel xác minh nhận tiền mới confirm; guest báo chuyển khoản chưa verify; alternative acceptance tạo request mới; GET email read-only; không bắt buộc lại 2FA cho ADMIN/SUPER_ADMIN.
Chỉ làm task được giao và dependency tối thiểu. Trước hết tái hiện lỗi bằng test có ý nghĩa; phân biệt code bug, khoảng trống sản phẩm và lỗi môi trường. Không vô hiệu hóa guard/test để lấy kết quả xanh; không tự tạo quy tắc thương mại chưa được chốt.
Kết thúc bằng: vấn đề và nguyên nhân; file đã sửa; contract/migration thay đổi; lệnh + kết quả test thật; lỗi môi trường hoặc việc còn blocked; rủi ro và hướng rollback. Cập nhật checklist chỉ khi có evidence. Nếu chưa thể làm vì thiếu credential/quyết định, hoàn thành phần độc lập, ghi rõ dependency và câu hỏi cụ thể.
```

## K01 — Nghiệm thu website không tồn phòng · P0 · đã triển khai, chưa đủ E2E

```text
Đọc quyết định không tồn phòng theo tên đầy đủ. Phần triển khai đã có: request-pricing chỉ trả loại phòng/giá; quote/submit/confirm/cancel không đọc hoặc ghi stock; stock UI/API/jobs đã nghỉ. Không làm lại bằng cách thêm hold, buffer, trừ/hoàn tồn hoặc “vô hạn giả”.
Viết/chạy integration và browser case request → hotel review → QR → guest report → hotel verify → confirmed → free cancellation và late fee accept/decline/expiry mà không cần inventory_day/hold. Kiểm tra mọi API entry point, UI còn/hết phòng và scheduler không vô tình quay lại.
Nghiệm thu: không stock SQL trong active flow, response không có count/availability flag, old stock API không phục vụ thao tác (401/403 hoặc 404 tùy security context; không được ghi). Manual approval/payment vẫn đúng guard, scope và replay. Giữ schema/migration lịch sử; không xóa DB thật.
```

## K02 — Email outbox, retry và phục hồi · P0 · sau K11

```text
Đọc PublicReservationEmailActionController, BrevoBookingNotificationService và CustomerPasswordResetService. Hiện transition consume token trước khi mail gửi, send nuốt lỗi và UI nói đã gửi.
Thiết kế và triển khai delivery bền vững bằng outbox hoặc cơ chế tương đương theo kiến trúc repo: ghi intent trong transaction, gửi ngoài transaction, retry có backoff/giới hạn, event key duy nhất, trạng thái delivery và resend theo quyền. Inject mail transport để fake trong tests. Không hứa exactly-once qua mạng; xử lý duplicate bằng event/provider contract đã xác minh. Không lưu/log raw token vô bảo vệ: nếu cần gửi lại, thiết kế dữ liệu nhạy cảm với expiry và quyền truy cập.
Nghiệm thu: provider timeout/429/500, process restart, thiếu config, DB rollback và retry không làm mất bước QR/payment/alternative, không tạo payment/booking trùng; UI phản ánh queued/sent/failed trung thực. Không gửi mail thật.
```

## K03 — Tách CMS khỏi hạ tầng web · P1

```text
Chạy architecture tests để tái hiện security → web → security. Đọc web/package-info, security/package-info, SecurityErrorResponses và hai SiteImageSlotController.
Di chuyển CMS site-image repository/service/controller/model sang module nghiệp vụ phù hợp hoặc module riêng có dependency được khai báo đúng; giữ web chỉ làm hạ tầng/error contract. Không tạo vòng mới, không nới allowedDependencies để che cycle. Giữ URL API/permission/GLOBAL scope và audit tương thích.
Nghiệm thu: ModuleStructureTest.moduleStructureIsValid và LayeringRulesTest xanh; test API list/update/public có scope, 401/403/404 và audit. Nếu thêm module hợp lệ, cập nhật baseline tên module với lý do rõ.
```

## K04 — Lifecycle naming và baseline kiến trúc · P1 · sau K03

```text
Tái hiện ForbiddenConceptsTest.noCollapsedLifecycleFields và ModuleStructureTest.onlyFoundationModulesExist. Trong MeGuestReviewController, đổi Stay.status thành tên đúng nghĩa stayStatus, cập nhật mapping/use mà không đổi JSON contract không cần thiết.
Đối chiếu module list mong đợi với module thực và quyết định kiến trúc. Cập nhật expectation chỉ cho module hợp lệ; không xóa ForbiddenConceptsTest hoặc bỏ reservation types khỏi kiểm tra.
Nghiệm thu: toàn bộ architecture tests xanh; review eligibility vẫn chỉ owner của completed stay và một review/reservation, không đọc chéo tài khoản.
```

## K05 — Lint toàn frontend và phạm vi rule · P1 · đã sạch phần no-stock

```text
Lint 10 file trọng tâm no-stock đã qua; con số 25 errors/54 warnings là baseline trước thay đổi. Chạy lại npm run typecheck và npm run lint trên snapshot hiện tại để có số thực.
Sửa lỗi React/Next.js thật (đặc biệt JSX trong try/catch nếu còn); phân scope rule cho TS/React, legacy browser JS và Node/CommonJS tools. Không bỏ qua toàn src hoặc tắt rule để làm xanh, không format cả repo.
Nghiệm thu: typecheck/full lint qua hoặc ghi chính xác phần còn lỗi, test các file thay đổi; giữ customer password auth, admin shared-account auth và quyết định không tồn phòng.
```

## K06 — Customer recovery hoàn chỉnh trong Next.js · P1

```text
Đọc AuthController forgot/reset-password, CustomerPasswordResetService, auth.ts và customer routes. Backend reset chỉ cho CUSTOMER; email còn dẫn legacy manage-booking trong lần rà. Xác minh lại contract trước sửa.
Thêm typed client và customer forgot/reset VI/EN, configured frontend link, xử lý missing/expired/used token, password confirmation, pending/network/error/success và login mới. Không lưu token localStorage/log/analytics.
Staff dùng một SUPER_ADMIN email/mật khẩu theo doc154. Customer recovery chỉ phục vụ tài khoản khách; không nối endpoint customer sang tài khoản admin dùng chung, không mở lại partner signup.
Nghiệm thu: unknown email không lộ account; reset đúng một lần; password cũ và phiên cũ bị thu hồi; fake mail tests và link deployment đúng cấu hình.
```

## K07 — Password reset policy, abuse và transaction · P1 · phối hợp K02/K06

```text
Đối chiếu validation reset 8–200 với CustomerRegistrationService/password policy; kiểm tra limiter ở security/filter/reverse proxy trước khi kết luận thiếu. Thiết kế policy thống nhất theo yêu cầu đã chốt.
Đưa HTTP email ra khỏi transaction, không để lỗi gửi mail vô hiệu token hợp lệ mà không có đường phục hồi. Bổ sung request throttling/abuse control thích hợp, expiry/one-use và invalidate session/token đúng thứ tự. Generic response cho unknown account; không lộ email tồn tại qua lỗi chi tiết/log.
Nghiệm thu: weak/overlong password, token expired/reused/concurrent, repeated request, provider fail và inactive customer; không thay password khi bất kỳ guard nào fail. Nếu partner recovery ngoài scope, ghi rõ.
```

## K08 — Alternative offer hợp lệ khi tạo và chấp nhận · P1

```text
Đọc proposeAlternative/acceptAlternative, schema offer/token và public publication predicates. Bổ sung guard ngày hợp lệ theo giờ Việt Nam và giới hạn đã được chốt; tái kiểm tra khách sạn/phòng còn OPEN/PUBLISHED khi guest accept. Kiểm tra occupancy, currency, totals, quantity và snapshot, lỗi null trả đúng API contract.
Chấp nhận chỉ tạo request mới: không giữ tồn/confirm/payment, không mang availability approval sang hotel mới. Rà SLA, distribution channel, membership snapshot, price snapshot và receipt/tracking contract của request mới so với request gốc. Không tự áp quote engine làm mất manual agreed total.
Nghiệm thu: quá hạn, past check-in, property closed/unpublished sau khi offer gửi, accept/reject race, replay và concurrent offers; mỗi offer tạo tối đa một replacement, rollback toàn bộ khi lỗi.
```

## K09 — Nghiệm thu queue báo phí hủy đã có · P1

```text
Đọc CancellationQueue, cancellationsApi, OpsCancellationController và CustomerCancellationService. Route hiện tại là /api/v1/admin/ops/reservations/cancellation-requests; màn /partner/cancellation-requests đã có. Không dựng lại.
Kiểm tra browser late request → staff quote fee → customer accept/decline, expiry 12:00 giờ Việt Nam, sai scope/permission, phí không hợp lệ, stale/replay và lỗi mạng. Đã bổ sung chọn % hoặc số tiền cụ thể, mức phí xem trước và hộp thoại xác nhận gửi. Nghiệm thu 0%, 100%, phần trăm lẻ tối đa 2 số thập phân, ROUND_HALF_UP trên total_minor phía server, đơn vị tiền, thiếu tổng giá, gửi cả hai/không gửi loại phí, nhập feeMinor lẻ hoặc vượt long. Lưu kiểu phí/căn cứ trong audit. Khách chưa accept thì chưa hủy. Không đọc/ghi tồn phòng.
Nghiệm thu: bằng chứng E2E cho nhánh thành công/thất bại/expire và API/history/audit tương ứng; bảo toàn integration test mới.
```

## K10 — Check-in, check-out và no-show · P1

```text
Đối chiếu OpsReservationController, stay lifecycle, policies và loyalty. Chốt transition V1 đã có quyết định trước khi thêm mutation. Ops list/detail hiện chủ yếu read-only.
Hoàn thiện mutation/client/UI đã được duyệt, permission/scope/version guard, ngày/giờ, reason, audit/history và loyalty side effects atomic. Website không quản lý tồn: không thêm allocation, availability search hay trừ/hoàn phòng.
Nghiệm thu: confirmed → check-in → check-out; no-show đúng điều kiện; sai transition/cross-scope/stale version/retry không ghi. Review chỉ eligible đúng trạng thái hoàn tất. Không tự bịa phí, refund, no-show policy hoặc earn-points rule.
```

## K11 — Thống nhất transition sales và email · P1

```text
Đối chiếu SalesRequestService.win với ReservationEmailActionService. Lập bảng from/event/guard/to/payment/history/audit/version/token; không có cột hay side effect stock.
Refactor business transition dùng chung cho authenticated console và email bearer action, truyền actor phù hợp; giữ salesStatus tách stayStatus. Payment VERIFIED chỉ xuất hiện sau hotel explicit verify; guest report không được confirm.
Nghiệm thu race approve/cancel, accept/reject, verify hai lần và console/email đồng thời: mỗi transition hợp lệ có đúng effect payment/history/audit, không đọc/ghi stock và không giữ transaction khi gọi email HTTP. Phối hợp K02/K14 để event delivery không mất.
```

## K12 — Song ngữ và Money contract · P1

```text
Rà BrevoBookingNotificationService, email landing pages, request receipts, customer stays và error copy. Giữ locale khách qua toàn chuỗi request/payment/alternative/reset và dùng fallback thống nhất.
Thay nối chuỗi tiền raw minor bằng Money/exponent hoặc enforce VND nếu đó là contract thực. Form alternative không được label VND nhưng silently dùng currency khác. Escape nội dung khách sạn/khách hàng và URL; không render instruction HTML chưa sanitize.
Nghiệm thu: VI/EN đủ sáu email action và error/expiry; VND đúng số, thêm test currency exponent khác nếu hỗ trợ; XSS payload không chạy; không thay business total.
```

## K13 — Proxy, CORS và PATCH · P1

```text
Đọc SecurityConfig, next.config.ts, config/env và legacy api.js để xác định topology đang dùng. CORS allow methods hiện thiếu PATCH dù nhiều controller PATCH. Chốt origin cấu hình theo môi trường, giữ exact allowlist/credentials và CSRF; không dùng wildcard.
Nếu cross-origin là topology được hỗ trợ, bổ sung PATCH và kiểm tra preflight/headers. Nếu chỉ same-origin, tài liệu và client phải nhất quán; không xóa hỗ trợ legacy còn cần mà chưa chuyển xong.
Nghiệm thu: allowed/disallowed origin × GET/POST/PATCH/DELETE/OPTIONS, cookie secure/sameSite/domain/path, CSRF có/thiếu/sai; Next proxy browser và server cookie forwarding đều đúng. Cập nhật comment no-CORS lỗi thời.
```

## K14 — Idempotency notification/token · P1 · cùng thiết kế K02

```text
Đọc ReservationRequestService/S1Transaction/idempotency repository và PublicReservationRequestController.submit gọi notification sau replay. Hiện notification có thể issue REVIEW token mới cho cùng receipt.
Chống tạo notification/token trùng bằng event identity và unique constraint trong DB; payload replay không tạo side effect mới. Xác minh Brevo dedupe header/cửa sổ thời gian bằng tài liệu chính thức trước khi dựa vào provider. Không coi raw HTTP header tự đặt là bằng chứng exactly-once.
Nghiệm thu: cùng key/cùng body (sequential + concurrent) → một request, một logical guest event, một logical hotel event; khác body → 409; retry sau provider timeout/DB restart không mất email hoặc tạo token mâu thuẫn; phối hợp outbox K02.
```

## K15 — Site image slots: audit, version và truy vấn · P2 · sau K03

```text
Đọc controller/repository/DTO mới sau K03. Bỏ audit role hardcode SUPER_ADMIN, suy ra actor đúng convention repo; audit không chứa secret. Truy vấn theo key thay vì findAll lọc; đối chiếu optimistic locking contract của site slots và bổ sung nếu cần cùng migration mới.
Giữ GLOBAL scope, permission content.manage và public enabled filtering. Test absolute HTTPS/same-origin reference, protocol-relative/traversal/backslash, disable/clear, unknown key, stale update và audit before/after.
Nghiệm thu: actor role đúng, hai editor không silently ghi đè khi contract có version; API client và UI tương thích, không làm mất 53 slot hiện hữu.
```

## K16 — Nghiệm thu các màn quản trị vừa nối · P1

```text
Đọc doc155 và code hiện tại: /admin/reviews, /admin/vouchers, /admin/customers, /admin/properties/[id] (Trip.com), content/map, content/sources, collection và /partner/policies đều đã có. Không tái tạo các màn hoặc endpoint đã xong.
Nghiệm thu browser loading/empty/error/filter/pagination/form/permission: review approve/reject/hide/show/delete với lý do, voucher type/value/dates/limits/status/duplicate code, customer profile (không sửa điểm/hạng), Trip.com quý hợp lệ và sửa quý cũ không đè quý mới, chính sách chung/override/VI-EN/activation/archive.
Kiểm tra lỗi 400/404/409 đúng contract, không 500 khi từ chối hợp lệ; giữ role catalogue, scope và audit. Không thêm tồn phòng hay tự scrape Trip.com.
```

## K17 — Media và tài sản ảnh sau deployment · P1

```text
Kiểm tra mediaApi signed upload-url → storage PUT → complete → link/reorder/cover/delete và site-image-slots/public guidebook. Xác minh mime/size/object ownership/expiry và metadata không tự coi upload thành công.
Đối chiếu relative /uploads và assets với filesystem được Next.js/deployment phục vụ; URL đã lưu DB không đồng nghĩa file tồn tại ở origin mới. Lập manifest ảnh thiếu, không tự tải ảnh bên thứ ba hoặc xóa uploads.
Nghiệm thu bằng storage test/fake hoặc môi trường test được cấp: upload đúng/sai/partial/expired, asset khác owner, complete hai lần, link cover/gallery, public ảnh hợp lệ và fallback khi hỏng. Không đòi credential nếu có phần có thể test độc lập; ghi rõ bước còn blocked.
```

## K18 — Admin dùng chung, customer auth, RBAC/scope/PII · P1

```text
Đọc docs/kas/154-owner-decision-shared-admin-account.md và no-website-inventory. Staff dùng một SUPER_ADMIN GLOBAL bằng email/mật khẩu, chung session cho /admin và /partner. Không còn key-login. Partner signup không có backend handler và /partner/register trả not-found.
Test mật khẩu đúng/sai, khóa 15 phút sau 5 lần sai liên tiếp, đăng nhập thành công/reset hợp lệ xóa bộ đếm, ghi nhận lần sai vẫn commit, customer isolation, cookie/CSRF, refresh/logout/revoke. Dùng tài khoản giả trên DB test; không provision/reset/in mật khẩu thật.
Kiểm tra GLOBAL media owner context và policy contextPropertyId được thu hẹp từ khách sạn trong scope, không nâng quyền actor. Không cấp thêm quyền ADMIN chỉ để UI chạy, không bật lại 2FA bắt buộc hoặc partner signup.
Nghiệm thu ma trận quyền/negative tests và bằng chứng browser theo cả hai console.
```

## K19 — Integration và browser E2E theo luồng mới · P1

```text
Đọc doc155 và ma trận luồng. Frontend snapshot mới có 77 files/1.426 tests pass; integration mới nằm trong AdminOperationsIT. Các kết quả này chưa chứng minh browser E2E hoặc deployment thật.
Trên PostgreSQL test disposable, chuyển các assertion reservation/sales còn đòi hold về invariant không stock. Giữ test scope/idempotency/payment/state machine và thay case sản phẩm đã rút bằng case từ chối/không có handler, không khôi phục feature cũ cho test xanh.
Mail/storage fake; browser kiểm tra customer auth/recovery/booking, manual payment/alternative/cancellation, admin shared-account auth, property publish, rates, media, fee queue/conversations. Bao gồm retries/races/expiry/session/empty/error/VI/EN/mobile. Không dùng database/email thật.
Nghiệm thu từng case ID có fixture, role, expected API/DB/UI và PASS/FAIL/BLOCKED evidence; skipped không tính pass. Không bỏ test bảo mật hoặc giữ data tồn giả để thay cho test luồng mới.
```

## K20 — Đồng bộ README, comment và tài liệu hiện tại · P2

```text
Đối chiếu code với doc152, doc153 no-website-inventory, doc154 shared-admin-account và doc155 migration. Thống nhất manual booking, không stock, email/mật khẩu admin dùng chung, partner signup withdrawn, URL HTTPS/R2 cùng thư viện media.
Gỡ mô tả key-login đã rút trong tài liệu hướng dẫn hiện tại; chỉ giữ ghi chú lịch sử có nhãn. Cập nhật consumer/đường dẫn tài liệu đã chuyển theo docs/legacy-frontend/MOVED-FILES.txt. Không coi log cũ là bằng chứng của mã mới.
Nghiệm thu link nội bộ đúng, hướng dẫn chạy đúng snapshot và test counts/log có thời điểm/phạm vi; không đưa secret vào tài liệu.
```

## K21 — Cleanup legacy, source không hoạt động và dependency · P2

```text
45 ghi chú/log đã chuyển vào docs/legacy-frontend, có MOVED-FILES.txt; không chuyển lại. Giữ admin V22 theo QD-B. Lập consumer map của HTML/Node/Next, deployment config, runtime JSON, uploads/assets và reset URLs trước khi đề xuất gỡ trong task riêng. Rà source/client/test partner self-registration hoặc key-login còn không dùng; contract đã bị rút không phải feature cần hoàn thiện.
Stock classes/schema lịch sử không còn hoạt động. Có thể cleanup source/test obsolete sau khi chứng minh không consumer; không khởi động lại bean/API/job cũ. Không sửa migration đã áp dụng hoặc xóa database/ảnh/backup thật.
Làm commit nhỏ, giữ price/day/base/bulk, customer recovery và media đang dùng. Nghiệm thu typecheck/lint/tests/build/smoke, URL migration rõ; không dựa chỉ rg không có kết quả để kết luận an toàn.
```

## K22 — Flyway và isolation database test · P1

```text
Repo hiện có migrations đến V41; workspace có thay đổi LocalDatabase/test-fixtures/devsetup. Đọc implementation thực trước chạy, chỉ dùng PostgreSQL disposable hoặc test database được xác định rõ; không suy ra kas_web_dev là test DB an toàn.
Kiểm tra fresh/upgrade/checksum/constraints/indexes trên DB test; giữ dữ liệu booking/media/membership và no-stock runtime. Không sửa V1–V42 đã áp dụng trên DB test hoặc dùng Flyway repair ép xanh. Không tự chạy shared-admin provisioning, cấp/rotate mật khẩu, migrate staging/production hay DB vận hành.
Nghiệm thu có DB identity đã che thông tin nhạy cảm, schema version, log migration/validation, cleanup và backup/restore test; thiếu môi trường ghi BLOCKED. Không publish dữ liệu public tham khảo khi chưa được duyệt.
```

## K23 — Toolchain, build và test tái lập · P2

```text
Workaround TEMP/TMP trong workspace đã giúp Vitest chạy; no-stock frontend 75 files/1.422 tests và backend targeted7 đã pass. Đây là bằng chứng cũ có phạm vi, không phải lý do bỏ kiểm tra sau auth changes.
Chạy snapshot hiện tại với đúng lockfile/toolchain/cache/test DB, tách sandbox loopback/EPERM khỏi bug. Production build trước bị Google Fonts; thử môi trường mạng hợp lệ hoặc phương án local-font có quyền đã được duyệt. Đọc Next local guide trước sửa config.
Nghiệm thu log thật gồm lệnh/exit code/test counts/skips/build; không ignoreBuildErrors hoặc tắt tests. Không in key, secrets hoặc dùng DB vận hành để vượt chặn môi trường.
```

## K24 — CI và release readiness · P1 · cuối chuỗi

```text
Thiết lập/đối chiếu CI typecheck/full lint/frontend tests/build, backend unit/architecture/integration và Flyway trên DB test. Artifact logs phải che secrets; admin auth dùng fixture, không cấp mật khẩu thật trong CI.
Release checklist gồm no-stock manual booking end-to-end, shared admin/customer password đúng scope, email/outbox worker, storage/gallery, domain/HTTPS/cookies, health, backup/restore và rollback. Không có stock scheduler hoặc stock sync.
Nghiệm thu evidence/run ID/owner và PASS/FAIL/BLOCKED; skipped không tính pass. Không tự deploy/migrate môi trường thật, không tuyên bố go-live từ compile hoặc targeted tests.
```

## K25 — Hồi quy snapshot mới và cô lập test · P1 · frontend cũ đã sửa

```text
Không tái giao “sửa 5 frontend failures” như lỗi còn mở: clock fixture và trip-intent mock đã sửa, full no-stock suite đã pass. Đọc snapshot hiện tại vì SignInForm/shared-admin-account và backend fixtures còn thay đổi sau lần chạy đã ghi.
Chạy lại typecheck/lint/frontend tests, backend unit/architecture và test mới PasswordLoginLockoutTest nếu có DB test. Rà test cũ còn giả partner signup/key-login/stock; chuyển sang contract hiện tại và giữ các negative/security cases. Không sửa code để phục hồi tính năng bị rút chỉ vì test cũ.
Cố định clock và restore, mocks đầy đủ cho dependency mới; partial-error vẫn phải test. Security unit test phải tách DB hoặc đưa phần DB thật sang IT; không trỏ vào DB vận hành để xanh.
Nghiệm thu số pass/fail/skipped chính xác, hai ngày hệ thống khác nhau không làm test stale, không có test âm thầm dùng dữ liệu/mật khẩu thật. Kiến trúc còn fail phải xử lý K03/K04 thay vì xóa guard.
```

## Cập nhật Brevo và quốc tịch — 25/10/2026

Đã nối key/sender BREVO_* và template ID từ .env; email khách VN dùng VI, quốc gia khác/không có dùng EN, độc lập locale website. Luồng hiện có: welcome, nhận yêu cầu, QR, xác nhận, hủy đã hoàn tất, đề xuất và yêu cầu thay thế. Password reset gửi nội dung VI/EN theo quốc tịch, sau commit, link sang màn reset Next.js đã được chủ dự án cho phép.

Nghiệm thu tiếp: hộp thư thực tế; mẫu MEMBER_EMAIL_VERIFICATION_VI hiện Brevo trả 404; trigger verification/nâng hạng/hoàn tất kỳ nghỉ chưa đầy đủ, không đánh dấu đã có. Kiểm tra QR theo khách sạn, URL báo thanh toán trong paymentDescription, URL chấp nhận/từ chối đề xuất, và lỗi mail không đảo ngược quyết định đã lưu. Test network dùng sandbox-drop, không phải bằng chứng đã giao thư. Chi tiết: docs/verification/2026-10-25-admin-ui/BREVO_AND_TEST_WEB.md.


Cập nhật kiểm tra lại 25/10/2026 sau khi chủ dự án sửa ID: 18/18 template trong .env đều tồn tại và active. MEMBER_EMAIL_VERIFICATION_VI ID 9 đã trả HTTP 200 khi đọc và HTTP 201 khi thử sandbox-drop; lỗi 404 trước đó đã hết. Đã nạp lại backend trên kas_web_test. Việc ID hợp lệ không tự bổ sung trigger verification/nâng hạng/hoàn tất kỳ nghỉ còn thiếu; chưa thử giao thư tới hộp thư thật.
