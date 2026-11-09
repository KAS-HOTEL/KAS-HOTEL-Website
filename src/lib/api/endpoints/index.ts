/**
 * One module per backend controller. Only endpoints that exist are exported.
 *
 * Modules arrive with the feature that consumes them (Steps 8–17). Adding one
 * before its screen exists would mean typing a contract nobody has exercised.
 *
 * Not yet wrapped because there is no matching guest screen/contract — see doc
 * 100 §10: portfolio availability search (OQ-122) · public offers and content
 * pages. The backend does provide `GET /me/profile`, but there is no frontend
 * client or customer profile screen yet. Media upload is implemented as a
 * signed-URL flow (`upload-url` → direct storage PUT → `complete`) and is wrapped
 * below; it still needs object-storage configuration (OQ-106/OQ-107).
 *
 * `GET /public/amenities` was implemented in Step 16A.43 and is wrapped in
 * `publicHotels.ts`. **`GET /public/locations` was implemented in Step 16A.44 and
 * is deliberately not wrapped**: no `/locations` page exists, and this module's
 * own rule is that a client arrives with the screen that consumes it — a typed
 * function for a route nothing calls is an invitation to call it.
 *
 * The public location endpoint also exists without a frontend location page.
 */
export { authApi, sessionApi } from './auth';
export { customerStaysApi } from './customerStays';
export { customerProfileApi } from './customerProfile';
export { propertiesApi } from './properties';
export { paymentAccountApi } from './paymentAccount';
export { roomTypesApi } from './roomTypes';
export { amenitiesApi } from './amenities';
export { policiesApi } from './policies';
export { ratesApi } from './rates';
export { publicHotelsApi } from './publicHotels';
export { reservationsApi } from './reservations';
export { salesRequestsApi } from './salesRequests';
export type { ContactLogEntry, SalesQueueCounts, SalesQueueFilters, SalesQueueView, SalesRequestNote } from './salesRequests';
export { opsReservationsApi } from './opsReservations';
export type { ReservationSearchFilters } from './opsReservations';
export { mediaApi } from './media';
export { siteImageSlotsApi } from './siteImageSlots';
export { submissionsApi } from './submissions';
export { facilitiesApi } from './facilities';
export { landmarksApi } from './landmarks';
export { experiencesApi } from './experiences';
