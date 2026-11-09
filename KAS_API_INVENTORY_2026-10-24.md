# KAS — Danh mục API và màn hình hiện tại

Cập nhật 24/10/2026 theo snapshot `284d6a2` và mã chưa commit. Trích từ source: **40 controller HTTP**, **150 method/path**, **23 file API client** (kể cả index), **51 file page.tsx**. Số file không đồng nghĩa số chức năng đã nghiệm thu.

## Contract ưu tiên

- Website không có dữ liệu tồn phòng, giữ phòng hoặc tự trừ/hoàn tồn. Giá, sức chứa và số phòng khách yêu cầu vẫn được giữ.
- Staff dùng một SUPER_ADMIN GLOBAL bằng **email/mật khẩu** cho `/admin` và `/partner`, theo doc154. Cookie HttpOnly + CSRF. Không có `/auth/key-login` và không có partner signup backend.
- QD-A: cho dán URL HTTPS và giữ R2 khi cấu hình. Dùng `external_url`/media_link hiện có, alt VI/EN và publication gates. GLOBAL upload phải chọn chủ sở hữu.
- QD-B: giữ admin V22 đến khi đối chiếu dữ liệu ảnh/giá. QD-C: ghi chú/log ở `docs/legacy-frontend/`.
- Nguồn: doc152, doc153 no-website-inventory, doc154 shared-admin-account, [doc155 triển khai](docs/kas/155-admin-console-migration.md).

## Các luồng vừa bổ sung

| Màn hình | API/client chính | Hiện trạng |
| --- | --- | --- |
| `/partner/requests/[reference]` | approve-payment, propose-alternative, confirm-payment; salesRequestsApi | Duyệt QR trước, khách sạn xác minh tiền mới WON/CONFIRMED |
| `/partner/cancellation-requests` | `/api/v1/admin/ops/reservations/cancellation-requests`; cancellationsApi | Danh sách và báo phí; khách chấp nhận phí mới hủy |
| `/admin/reviews` | reviewsApi | Duyệt/từ chối PENDING; hide/show APPROVED; delete mềm có quyền/lý do |
| `/admin/vouchers` | vouchersApi | List/filter/create/status; lỗi bộ lọc null và lỗi từ chối được sửa |
| `/admin/customers` | customersApi | Tìm kiếm/phân trang/sửa liên hệ; hạng và điểm chỉ đọc |
| `/admin/properties/[propertyId]` | tripRatingsApi | Nhập theo quý; quý cũ không đè điểm hiện tại của quý mới |
| Gallery khách sạn/hạng phòng | mediaApi.external, uploadUrl có owner context | URL HTTPS hoặc R2; cùng thư viện media |
| `/partner/policies` | sharedPoliciesApi; `contextPropertyId` | Ngữ cảnh đối tác được suy ra từ khách sạn đã chọn, không nâng scope actor |
| `/admin/content/map` | siteImageSlotsApi.adminList | Chỉ đọc danh mục vị trí ảnh |
| `/admin/content/sources` | ADMIN_IMAGE_SOURCE_INVENTORY.json | Chỉ đọc tham chiếu nguồn ảnh; giữ trạng thái chưa xác minh |
| `/admin/collection` | propertiesApi.list + mediaApi.covers | Tổng hợp ảnh bìa khách sạn thực tế |

## Method/path backend

Bảng trích annotation; guard còn phụ thuộc SecurityConfig, actor, scope và service/SQL. Public bearer action vẫn cần token. Không thay thế schema OpenAPI hoặc bằng chứng E2E.

| Method | Full path | Guard / kiểm tra bổ sung | Nguồn |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/amenities` | `amenity.manage` | `backend/src/main/java/com/kas/platform/catalog/api/AmenityCatalogController.java:51` |
| GET | `/api/v1/admin/customers` | `customer.view` | `backend/src/main/java/com/kas/platform/customer/api/AdminCustomerController.java:41` |
| GET | `/api/v1/admin/customers/{customerId}` | `customer.view` | `backend/src/main/java/com/kas/platform/customer/api/AdminCustomerController.java:81` |
| PATCH | `/api/v1/admin/customers/{customerId}` | `customer.edit` | `backend/src/main/java/com/kas/platform/customer/api/AdminCustomerController.java:107` |
| GET | `/api/v1/me/profile` | `authenticated` | `backend/src/main/java/com/kas/platform/customer/api/MeCustomerController.java:29` |
| PUT | `/api/v1/me/profile` | `authenticated` | `backend/src/main/java/com/kas/platform/customer/api/MeCustomerController.java:52` |
| PUT | `/api/v1/admin/properties/{propertyId}/trip-rating` | `integration.manage` | `backend/src/main/java/com/kas/platform/integration/api/AdminTripRatingController.java:42` |
| GET | `/api/v1/public/trip-ratings` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/integration/api/PublicTripRatingsController.java:23` |
| GET | `/api/v1/public/request-pricing/properties/{slug}` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/inventory/api/PublicAvailabilityController.java:54` |
| POST | `/api/v1/public/request-pricing/quote` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/inventory/api/PublicAvailabilityController.java:66` |
| GET | `/api/v1/admin/media` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:58` |
| GET | `/api/v1/admin/media/covers` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:93` |
| GET | `/api/v1/admin/media/{assetId}` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:102` |
| POST | `/api/v1/admin/media` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:112` |
| POST | `/api/v1/admin/media/external` | `media.upload, media.publish` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:122` |
| POST | `/api/v1/admin/media/upload-url` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:154` |
| POST | `/api/v1/admin/media/{assetId}/complete` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:186` |
| PATCH | `/api/v1/admin/media/{assetId}/translations` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:194` |
| POST | `/api/v1/admin/media/{assetId}/publish` | `media.publish` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:206` |
| GET | `/api/v1/admin/media/{assetId}/usages` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:216` |
| POST | `/api/v1/admin/media/{assetId}/links` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:227` |
| DELETE | `/api/v1/admin/media/{assetId}/links/{linkId}` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:239` |
| PATCH | `/api/v1/admin/media/{assetId}/links/{linkId}/cover` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:247` |
| PATCH | `/api/v1/admin/media/{assetId}/links/{linkId}/order` | `media.upload` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:254` |
| PATCH | `/api/v1/admin/media/{assetId}/links/{linkId}/status` | `media.publish` | `backend/src/main/java/com/kas/platform/media/api/AdminMediaController.java:263` |
| GET | `/api/v1/public/properties/{slug}/gallery` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/media/api/PublicMediaController.java:40` |
| GET | `/api/v1/public/properties/{slug}/room-types/{roomTypeSlug}/gallery` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/media/api/PublicMediaController.java:48` |
| GET | `/api/v1/admin/property-submissions` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/AdminReviewController.java:58` |
| GET | `/api/v1/admin/property-submissions/{submissionId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/AdminReviewController.java:73` |
| POST | `/api/v1/admin/property-submissions/{submissionId}/approve` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/AdminReviewController.java:81` |
| POST | `/api/v1/admin/property-submissions/{submissionId}/reject` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/AdminReviewController.java:89` |
| POST | `/api/v1/admin/property-submissions/{submissionId}/request-changes` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/AdminReviewController.java:98` |
| GET | `/api/v1/admin/properties/{propertyId}/experiences` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerExperienceController.java:69` |
| POST | `/api/v1/admin/properties/{propertyId}/experiences` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerExperienceController.java:95` |
| PATCH | `/api/v1/admin/properties/{propertyId}/experiences/{experienceId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerExperienceController.java:115` |
| DELETE | `/api/v1/admin/properties/{propertyId}/experiences/{experienceId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerExperienceController.java:139` |
| GET | `/api/v1/admin/properties/{propertyId}/facilities` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerFacilityController.java:58` |
| POST | `/api/v1/admin/properties/{propertyId}/facilities` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerFacilityController.java:82` |
| PATCH | `/api/v1/admin/properties/{propertyId}/facilities/{facilityId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerFacilityController.java:108` |
| DELETE | `/api/v1/admin/properties/{propertyId}/facilities/{facilityId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerFacilityController.java:129` |
| GET | `/api/v1/admin/properties/{propertyId}/landmarks` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerLandmarkController.java:63` |
| POST | `/api/v1/admin/properties/{propertyId}/landmarks` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerLandmarkController.java:88` |
| PATCH | `/api/v1/admin/properties/{propertyId}/landmarks/{landmarkId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerLandmarkController.java:108` |
| DELETE | `/api/v1/admin/properties/{propertyId}/landmarks/{landmarkId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerLandmarkController.java:129` |
| GET | `/api/v1/admin/properties/{propertyId}/payment-profile` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPaymentProfileController.java:35` |
| PUT | `/api/v1/admin/properties/{propertyId}/payment-profile` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPaymentProfileController.java:52` |
| GET | `/api/v1/admin/properties/{propertyId}/policies` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyController.java:60` |
| GET | `/api/v1/admin/properties/{propertyId}/policies/{policyId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyController.java:69` |
| POST | `/api/v1/admin/properties/{propertyId}/policies` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyController.java:77` |
| PATCH | `/api/v1/admin/properties/{propertyId}/policies/{policyId}/translations` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyController.java:88` |
| PATCH | `/api/v1/admin/properties/{propertyId}/policies/{policyId}/status` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyController.java:103` |
| GET | `/api/v1/admin/policies` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyModuleController.java:37` |
| GET | `/api/v1/admin/policies/{policyId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyModuleController.java:42` |
| POST | `/api/v1/admin/policies` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyModuleController.java:47` |
| PATCH | `/api/v1/admin/policies/{policyId}/translations` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyModuleController.java:58` |
| PATCH | `/api/v1/admin/policies/{policyId}/status` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPolicyModuleController.java:65` |
| GET | `/api/v1/admin/properties` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:73` |
| GET | `/api/v1/admin/properties/{propertyId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:100` |
| POST | `/api/v1/admin/properties` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:117` |
| PATCH | `/api/v1/admin/properties/{propertyId}` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:168` |
| PATCH | `/api/v1/admin/properties/{propertyId}/trip-intents` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:205` |
| PATCH | `/api/v1/admin/properties/{propertyId}/amenities` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:232` |
| POST | `/api/v1/admin/properties/{propertyId}/publish` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:264` |
| GET | `/api/v1/admin/properties/{propertyId}/completeness` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:275` |
| POST | `/api/v1/admin/properties/{propertyId}/submit` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:282` |
| GET | `/api/v1/admin/properties/{propertyId}/submissions` | `property.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerPropertyController.java:291` |
| GET | `/api/v1/admin/properties/{propertyId}/room-types` | `roomtype.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerRoomTypeController.java:49` |
| GET | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}` | `roomtype.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerRoomTypeController.java:67` |
| POST | `/api/v1/admin/properties/{propertyId}/room-types` | `roomtype.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerRoomTypeController.java:75` |
| PATCH | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}` | `roomtype.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerRoomTypeController.java:112` |
| PATCH | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}/amenities` | `roomtype.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerRoomTypeController.java:133` |
| PATCH | `/api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}/status` | `roomtype.manage` | `backend/src/main/java/com/kas/platform/onboarding/api/PartnerRoomTypeController.java:151` |
| GET | `/api/v1/public/amenities` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicAmenityController.java:65` |
| GET | `/api/v1/public/properties/{slug}/facilities` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicFacilityController.java:43` |
| GET | `/api/v1/public/locations` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicLocationController.java:57` |
| GET | `/api/v1/public/properties/{slug}/policies` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicPolicyController.java:45` |
| GET | `/api/v1/public/properties` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicPropertyController.java:72` |
| GET | `/api/v1/public/properties/{slug}` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicPropertyController.java:108` |
| GET | `/api/v1/public/properties/{slug}/room-types` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicPropertyController.java:127` |
| GET | `/api/v1/public/trip-intents` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/onboarding/api/PublicTripIntentController.java:24` |
| GET | `/api/v1/admin/rates/grid` | `rate.view` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:82` |
| GET | `/api/v1/admin/rates/base` | `rate.view` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:106` |
| PUT | `/api/v1/admin/rates/base/{roomTypeId}` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:137` |
| PUT | `/api/v1/admin/rates/day/{roomTypeId}/{date}` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:164` |
| DELETE | `/api/v1/admin/rates/day/{roomTypeId}/{date}` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:182` |
| POST | `/api/v1/admin/rates/bulk-preview` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:195` |
| POST | `/api/v1/admin/rates/bulk-apply` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:209` |
| GET | `/api/v1/admin/rate-rules` | `rate.view` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:220` |
| POST | `/api/v1/admin/rate-rules` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:228` |
| PATCH | `/api/v1/admin/rate-rules/{ruleId}` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:243` |
| PATCH | `/api/v1/admin/rate-rules/{ruleId}/status` | `rate.manage` | `backend/src/main/java/com/kas/platform/pricing/api/AdminRateController.java:252` |
| GET | `/api/v1/admin/sales/requests` | `sales.request.view` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:87` |
| GET | `/api/v1/admin/sales/requests/{reference}` | `sales.request.view` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:109` |
| POST | `/api/v1/admin/sales/requests/{reference}/decline` | `reservation.cancel` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:144` |
| POST | `/api/v1/admin/sales/requests/{reference}/cancel` | `reservation.cancel` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:161` |
| POST | `/api/v1/admin/sales/requests/{reference}/assign` | `sales.request.assign` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:176` |
| POST | `/api/v1/admin/sales/requests/{reference}/availability-check` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:197` |
| GET | `/api/v1/admin/sales/requests/{reference}/notes` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:212` |
| POST | `/api/v1/admin/sales/requests/{reference}/notes` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:225` |
| POST | `/api/v1/admin/sales/requests/{reference}/contact` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:241` |
| POST | `/api/v1/admin/sales/requests/{reference}/approve-payment` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:270` |
| POST | `/api/v1/admin/sales/requests/{reference}/propose-alternative` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:283` |
| POST | `/api/v1/admin/sales/requests/{reference}/confirm-payment` | `reservation.win` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:297` |
| POST | `/api/v1/admin/sales/requests/{reference}/win` | `reservation.win` | `backend/src/main/java/com/kas/platform/reservation/api/AdminSalesRequestController.java:305` |
| GET | `/api/v1/admin/message-templates/variables` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/MessageTemplateController.java:61` |
| GET | `/api/v1/admin/message-templates` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/MessageTemplateController.java:67` |
| POST | `/api/v1/admin/message-templates` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/MessageTemplateController.java:81` |
| PUT | `/api/v1/admin/message-templates/{id}` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/MessageTemplateController.java:97` |
| PUT | `/api/v1/admin/message-templates/{id}/enabled` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/MessageTemplateController.java:107` |
| DELETE | `/api/v1/admin/message-templates/{id}` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/MessageTemplateController.java:124` |
| GET | `/api/v1/me/stays` | `me.stay.view` | `backend/src/main/java/com/kas/platform/reservation/api/MeStayController.java:37` |
| POST | `/api/v1/me/stays/{reference}/cancel` | `me.stay.cancel` | `backend/src/main/java/com/kas/platform/reservation/api/MeStayController.java:89` |
| POST | `/api/v1/me/stays/{reference}/cancel/decision` | `me.stay.cancel` | `backend/src/main/java/com/kas/platform/reservation/api/MeStayController.java:96` |
| GET | `/api/v1/admin/ops/reservations/cancellation-requests` | `reservation.cancel` | `backend/src/main/java/com/kas/platform/reservation/api/OpsCancellationController.java:39` |
| POST | `/api/v1/admin/ops/reservations/cancellation-requests/{reference}/{requestId}/fee` | `reservation.cancel` | `backend/src/main/java/com/kas/platform/reservation/api/OpsCancellationController.java:44` |
| GET | `/api/v1/admin/ops/conversations` | `reservation.view` | `backend/src/main/java/com/kas/platform/reservation/api/OpsConversationController.java:80` |
| GET | `/api/v1/admin/ops/reservations/{reference}/messages` | `reservation.view` | `backend/src/main/java/com/kas/platform/reservation/api/OpsConversationController.java:100` |
| POST | `/api/v1/admin/ops/reservations/{reference}/messages/preview` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/OpsConversationController.java:116` |
| POST | `/api/v1/admin/ops/reservations/{reference}/messages` | `sales.request.manage` | `backend/src/main/java/com/kas/platform/reservation/api/OpsConversationController.java:137` |
| GET | `/api/v1/admin/ops/message-automation/log` | `reservation.view` | `backend/src/main/java/com/kas/platform/reservation/api/OpsConversationController.java:154` |
| GET | `/api/v1/admin/ops/reservations` | `reservation.view` | `backend/src/main/java/com/kas/platform/reservation/api/OpsReservationController.java:108` |
| GET | `/api/v1/admin/ops/reservations/{reference}` | `reservation.view` | `backend/src/main/java/com/kas/platform/reservation/api/OpsReservationController.java:149` |
| GET | `/api/v1/public/reservation-actions/{token}` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:28` |
| POST | `/api/v1/public/reservation-actions/{token}/approve` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:93` |
| POST | `/api/v1/public/reservation-actions/{token}/paid` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:101` |
| POST | `/api/v1/public/reservation-actions/{token}/confirm-payment` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:109` |
| POST | `/api/v1/public/reservation-actions/{token}/propose` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:117` |
| POST | `/api/v1/public/reservation-actions/{token}/accept-alternative` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:125` |
| POST | `/api/v1/public/reservation-actions/{token}/reject-alternative` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationEmailActionController.java:134` |
| POST | `/api/v1/public/reservations/requests` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationRequestController.java:72` |
| GET | `/api/v1/public/reservations/requests/{reference}/sent` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/reservation/api/PublicReservationRequestController.java:103` |
| GET | `/api/v1/admin/reviews` | `review.moderate` | `backend/src/main/java/com/kas/platform/review/api/AdminGuestReviewController.java:40` |
| PATCH | `/api/v1/admin/reviews/{reviewId}/moderation` | `review.moderate` | `backend/src/main/java/com/kas/platform/review/api/AdminGuestReviewController.java:65` |
| POST | `/api/v1/me/reviews` | `review.create` | `backend/src/main/java/com/kas/platform/review/api/MeGuestReviewController.java:35` |
| GET | `/api/v1/public/reviews` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/review/api/PublicGuestReviewController.java:23` |
| POST | `/api/v1/public/auth/forgot-password` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/security/api/AuthController.java:60` |
| POST | `/api/v1/public/auth/reset-password` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/security/api/AuthController.java:68` |
| POST | `/api/v1/public/auth/customer-register` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/security/api/AuthController.java:76` |
| POST | `/api/v1/public/auth/login` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/security/api/AuthController.java:97` |
| POST | `/api/v1/public/auth/refresh` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/security/api/AuthController.java:118` |
| POST | `/api/v1/public/auth/logout` | `authenticated` | `backend/src/main/java/com/kas/platform/security/api/AuthController.java:139` |
| GET | `/api/v1/me/sessions` | `authenticated` | `backend/src/main/java/com/kas/platform/security/api/SessionController.java:51` |
| DELETE | `/api/v1/me/sessions/{sessionId}` | `authenticated` | `backend/src/main/java/com/kas/platform/security/api/SessionController.java:67` |
| DELETE | `/api/v1/me/sessions` | `authenticated` | `backend/src/main/java/com/kas/platform/security/api/SessionController.java:78` |
| GET | `/api/v1/admin/vouchers` | `voucher.manage` | `backend/src/main/java/com/kas/platform/voucher/api/AdminVoucherController.java:39` |
| POST | `/api/v1/admin/vouchers` | `voucher.manage` | `backend/src/main/java/com/kas/platform/voucher/api/AdminVoucherController.java:68` |
| PATCH | `/api/v1/admin/vouchers/{id}/status` | `voucher.manage` | `backend/src/main/java/com/kas/platform/voucher/api/AdminVoucherController.java:103` |
| GET | `/api/v1/admin/site-image-slots` | `content.manage` | `backend/src/main/java/com/kas/platform/web/api/AdminSiteImageSlotController.java:39` |
| PATCH | `/api/v1/admin/site-image-slots/{key}` | `content.manage` | `backend/src/main/java/com/kas/platform/web/api/AdminSiteImageSlotController.java:45` |
| GET | `/api/v1/public/site-image-slots` | `public/token: xem service` | `backend/src/main/java/com/kas/platform/web/api/PublicSiteImageSlotController.java:22` |

## Typed API client

| File | Lời gọi được khai báo |
| --- | --- |
| `frontend/src/lib/api/endpoints/adminTools.ts` | list, moderate, list, create, setStatus, list, update, save |
| `frontend/src/lib/api/endpoints/amenities.ts` | list |
| `frontend/src/lib/api/endpoints/auth.ts` | login, register, registerCustomer, refresh, logout, list, revoke, revokeAll |
| `frontend/src/lib/api/endpoints/cancellations.ts` | list, quote |
| `frontend/src/lib/api/endpoints/conversations.ts` | inbox, thread, preview, record, automationLog, variables, list, create, update, setEnabled, remove |
| `frontend/src/lib/api/endpoints/customerProfile.ts` | get, update |
| `frontend/src/lib/api/endpoints/customerStays.ts` | list, cancel, decide |
| `frontend/src/lib/api/endpoints/experiences.ts` | list, create, update, remove |
| `frontend/src/lib/api/endpoints/facilities.ts` | list, create, update, archive |
| `frontend/src/lib/api/endpoints/index.ts` | re-export / helpers |
| `frontend/src/lib/api/endpoints/landmarks.ts` | list, create, update, remove |
| `frontend/src/lib/api/endpoints/media.ts` | library, covers, register, uploadUrl, external, complete, usages, attach, setCover, setOrder, detach |
| `frontend/src/lib/api/endpoints/opsReservations.ts` | search, detail |
| `frontend/src/lib/api/endpoints/policies.ts` | list, create, setTranslation, setStatus |
| `frontend/src/lib/api/endpoints/properties.ts` | list, create, get, completeness, update, setTripIntents, publish, setAmenities, getPaymentProfile, updatePaymentProfile |
| `frontend/src/lib/api/endpoints/publicHotels.ts` | tripIntents, properties, amenities, property, roomTypes, gallery, roomGallery, policies, facilities, availability, quote |
| `frontend/src/lib/api/endpoints/rates.ts` | grid, setDayPrice, clearDayPrice, baseRates, setBaseRate, bulkPreview, bulkApply, rules, updateRule, setRuleStatus |
| `frontend/src/lib/api/endpoints/reservations.ts` | request, receipt |
| `frontend/src/lib/api/endpoints/roomTypes.ts` | list, get, create, update |
| `frontend/src/lib/api/endpoints/salesRequests.ts` | approvePayment, proposeAlternative, confirmPayment, queue, notes, addNote, detail, decline, cancel, availabilityCheck, contact, win |
| `frontend/src/lib/api/endpoints/sharedPolicies.ts` | list, create, setTranslation, setStatus |
| `frontend/src/lib/api/endpoints/siteImageSlots.ts` | adminList, update, publicList |
| `frontend/src/lib/api/endpoints/submissions.ts` | queue, history, submit, get, approve, reject, requestChanges |

## Màn hình từ page.tsx

| Route | Source |
| --- | --- |
| `/[locale]/account/login` | `frontend/src/app/[locale]/account/login/page.tsx` |
| `/[locale]/account/register` | `frontend/src/app/[locale]/account/register/page.tsx` |
| `/[locale]/account/stays` | `frontend/src/app/[locale]/account/stays/page.tsx` |
| `/[locale]/guidebook` | `frontend/src/app/[locale]/guidebook/page.tsx` |
| `/[locale]/hotels/[slug]` | `frontend/src/app/[locale]/hotels/[slug]/page.tsx` |
| `/[locale]/hotels` | `frontend/src/app/[locale]/hotels/page.tsx` |
| `/[locale]` | `frontend/src/app/[locale]/page.tsx` |
| `/[locale]/requests/[reference]` | `frontend/src/app/[locale]/requests/[reference]/page.tsx` |
| `/admin/collection` | `frontend/src/app/admin/(protected)/collection/page.tsx` |
| `/admin/content/images` | `frontend/src/app/admin/(protected)/content/images/page.tsx` |
| `/admin/content/map` | `frontend/src/app/admin/(protected)/content/map/page.tsx` |
| `/admin/content/sources` | `frontend/src/app/admin/(protected)/content/sources/page.tsx` |
| `/admin/customers` | `frontend/src/app/admin/(protected)/customers/page.tsx` |
| `/admin` | `frontend/src/app/admin/(protected)/page.tsx` |
| `/admin/properties/[propertyId]` | `frontend/src/app/admin/(protected)/properties/[propertyId]/page.tsx` |
| `/admin/properties` | `frontend/src/app/admin/(protected)/properties/page.tsx` |
| `/admin/review/[submissionId]` | `frontend/src/app/admin/(protected)/review/[submissionId]/page.tsx` |
| `/admin/review` | `frontend/src/app/admin/(protected)/review/page.tsx` |
| `/admin/reviews` | `frontend/src/app/admin/(protected)/reviews/page.tsx` |
| `/admin/vouchers` | `frontend/src/app/admin/(protected)/vouchers/page.tsx` |
| `/admin/login` | `frontend/src/app/admin/login/page.tsx` |
| `/` | `frontend/src/app/page.tsx` |
| `/partner/cancellation-requests` | `frontend/src/app/partner/(protected)/cancellation-requests/page.tsx` |
| `/partner/messages/[reference]` | `frontend/src/app/partner/(protected)/messages/[reference]/page.tsx` |
| `/partner/messages` | `frontend/src/app/partner/(protected)/messages/page.tsx` |
| `/partner/messages/templates` | `frontend/src/app/partner/(protected)/messages/templates/page.tsx` |
| `/partner` | `frontend/src/app/partner/(protected)/page.tsx` |
| `/partner/policies` | `frontend/src/app/partner/(protected)/policies/page.tsx` |
| `/partner/properties/[propertyId]/calendar` | `frontend/src/app/partner/(protected)/properties/[propertyId]/calendar/page.tsx` |
| `/partner/properties/[propertyId]/information` | `frontend/src/app/partner/(protected)/properties/[propertyId]/information/page.tsx` |
| `/partner/properties/[propertyId]/inventory` | `frontend/src/app/partner/(protected)/properties/[propertyId]/inventory/page.tsx` |
| `/partner/properties/[propertyId]/media` | `frontend/src/app/partner/(protected)/properties/[propertyId]/media/page.tsx` |
| `/partner/properties/[propertyId]` | `frontend/src/app/partner/(protected)/properties/[propertyId]/page.tsx` |
| `/partner/properties/[propertyId]/policies` | `frontend/src/app/partner/(protected)/properties/[propertyId]/policies/page.tsx` |
| `/partner/properties/[propertyId]/rates` | `frontend/src/app/partner/(protected)/properties/[propertyId]/rates/page.tsx` |
| `/partner/properties/[propertyId]/rooms/[roomTypeId]/edit` | `frontend/src/app/partner/(protected)/properties/[propertyId]/rooms/[roomTypeId]/edit/page.tsx` |
| `/partner/properties/[propertyId]/rooms/[roomTypeId]/media` | `frontend/src/app/partner/(protected)/properties/[propertyId]/rooms/[roomTypeId]/media/page.tsx` |
| `/partner/properties/[propertyId]/rooms/[roomTypeId]` | `frontend/src/app/partner/(protected)/properties/[propertyId]/rooms/[roomTypeId]/page.tsx` |
| `/partner/properties/[propertyId]/rooms/new` | `frontend/src/app/partner/(protected)/properties/[propertyId]/rooms/new/page.tsx` |
| `/partner/properties/[propertyId]/rooms` | `frontend/src/app/partner/(protected)/properties/[propertyId]/rooms/page.tsx` |
| `/partner/properties/new` | `frontend/src/app/partner/(protected)/properties/new/page.tsx` |
| `/partner/properties` | `frontend/src/app/partner/(protected)/properties/page.tsx` |
| `/partner/requests/[reference]` | `frontend/src/app/partner/(protected)/requests/[reference]/page.tsx` |
| `/partner/requests` | `frontend/src/app/partner/(protected)/requests/page.tsx` |
| `/partner/reservations/[reference]` | `frontend/src/app/partner/(protected)/reservations/[reference]/page.tsx` |
| `/partner/reservations` | `frontend/src/app/partner/(protected)/reservations/page.tsx` |
| `/partner/forgot-password` | `frontend/src/app/partner/forgot-password/page.tsx` |
| `/partner/login` | `frontend/src/app/partner/login/page.tsx` |
| `/partner/register` — not-found, signup đã rút | `frontend/src/app/partner/register/page.tsx` |
| `/partner/reset-password` | `frontend/src/app/partner/reset-password/page.tsx` |
| `/partner/verify-code` | `frontend/src/app/partner/verify-code/page.tsx` |

## Kiểm chứng và giới hạn

Frontend 77 files / 1.426 tests và typecheck đã qua trên mã mới. Chi tiết lint, migration V42, integration test và build xem doc155. Chưa gửi email thật, thử R2 thật hoặc chứng nhận browser E2E/staging. Gửi thư cần Brevo; thiếu cấu hình vẫn ghi quyết định và không gửi HTTP ra ngoài. Admin cũ và dữ liệu ảnh/giá chưa gỡ.

Các annotation/source line được trích ở thời điểm cập nhật, cần đối chiếu lại sau mỗi thay đổi code. Bản `KAS_API_INVENTORY_2026-10-24.md` được giữ đồng bộ để liên kết cũ không hỏng; từ “inventory” trong tên file đó chỉ là tên kiểm kê tài liệu lịch sử, không phải chức năng tồn phòng.

## Bổ sung 25/10/2026 — Phí hủy theo phần trăm hoặc số tiền

- GET queue trả thêm `totalMinor` (có thể null) làm căn cứ xem trước.
- POST `.../cancellation-requests/{reference}/{requestId}/fee`: gửi đúng một trong `{ "feeMinor": 250000, "note": "..." }` hoặc `{ "percentage": 25, "note": "..." }`.
- `feeMinor`: số nguyên không âm ở đơn vị tiền nhỏ nhất; `percentage`: 0–100, tối đa 2 số thập phân. Không gửi cả hai, không bỏ trống cả hai.
- Phần trăm tính trên `reservation.total_minor` được máy chủ đọc dưới khóa giao dịch, làm tròn HALF_UP. Lưu fee cuối cùng, nhật ký có loại phí và căn cứ tính.
- Báo phí chỉ chuyển yêu cầu hủy sang QUOTED; khách quyết định trước khi đặt phòng bị hủy. Quyền và phạm vi giữ nguyên.

## Bổ sung 25/10/2026 — Quốc tịch và email

- POST /api/v1/public/auth/customer-register nhận thêm country tùy chọn (ISO alpha-2), lưu customer.country. Form đăng ký chọn quốc tịch; locale giao diện không quyết định ngôn ngữ email.
- Email khách lấy VN → VI; quốc gia khác/không có → EN. ID template từ BREVO_TEMPLATE_<EVENT>_VI/EN trong môi trường; cấu hình key/sender dùng BREVO_* với fallback KAS_BREVO_* cũ.
- POST /api/v1/public/auth/reset-password giữ payload {token,newPassword}; link email mới dùng /[locale]/account/reset-password?token=... . Không có API thay mật khẩu qua GET.
- Runtime test dùng profiles dev,web-test và kas_web_test.
