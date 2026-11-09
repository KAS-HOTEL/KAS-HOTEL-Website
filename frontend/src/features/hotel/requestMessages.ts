import type { Locale } from '@/config/env';

/**
 * Guest copy for the reservation request, in both frozen locales.
 *
 * <h2>Why a module and not an i18n framework</h2>
 *
 * `features/auth/messages.ts` states the position this file continues: *"a real
 * i18n layer arrives with the customer experience, and this module is the seam
 * it will replace."* The rest of the guest surface is still hardcoded
 * Vietnamese. Introducing a framework here would rewrite pages this step has no
 * mandate to touch, so the seam is widened instead — the same shape, now keyed
 * by locale, which the route already carries.
 *
 * <h2>What is not in here</h2>
 *
 * No claim that anything was sent. Notification delivery is **OQ-162** and no
 * mail sender exists, so no string says "email sent", "check your inbox" or
 * "confirmation on its way". The 201 even carries `trackingUrlIssued: false`
 * for exactly this reason, and the confirmation reads it rather than assuming.
 */

/**
 * Doc 58 §3.3's own value.
 *
 * V1 stores it **opaquely and never validates it** — OQ-167, closed by doc 117
 * §24.2. There is no policy catalogue endpoint to derive it from, no version to
 * look up, and this module must not invent one. It is a constant precisely so it
 * cannot drift into something that looks derived.
 */
export const ACCEPTED_TERMS_VERSION = 'booking-terms-v3';

export interface RequestCopy {
  readonly title: string;
  readonly intro: string;
  readonly summaryTitle: string;
  readonly summaryProperty: string;
  readonly summaryDates: string;
  readonly summaryNights: (count: number) => string;
  readonly summaryRooms: string;
  readonly summaryAdults: string;
  readonly summaryEstimate: string;
  readonly guestTitle: string;
  readonly fullName: string;
  readonly fullNameHint: string;
  readonly email: string;
  readonly emailHint: string;
  readonly phone: string;
  readonly phoneHint: string;
  readonly country: string;
  readonly countryHint: string;
  readonly countryPlaceholder: string;
  readonly preferredChannel: string;
  readonly bestTime: string;
  readonly notSpecified: string;
  readonly channelPhone: string;
  readonly channelEmail: string;
  readonly channelZalo: string;
  readonly channelSms: string;
  readonly timeMorning: string;
  readonly timeAfternoon: string;
  readonly timeEvening: string;
  readonly specialRequests: string;
  readonly specialRequestsHint: string;
  readonly marketingConsent: string;
  readonly terms: string;
  readonly submit: string;
  readonly submitting: string;
  readonly noChildren: string;
  readonly notFinalPrice: string;
  readonly fullNameRequired: string;
  readonly emailRequired: string;
  readonly emailInvalid: string;
  readonly phoneRequired: string;
  readonly phoneInvalid: string;
  readonly countryInvalid: string;
  readonly termsRequired: string;
  readonly fixFields: string;
  readonly errorNoAvailability: string;
  readonly errorKeyReused: string;
  readonly errorNotFound: string;
  readonly errorNetwork: string;
  readonly errorServer: string;
  /** Heading when a reopened receipt cannot be loaded — not when it is absent. */
  readonly receiptErrorTitle: string;
  readonly retry: string;
  readonly reference: (correlationId: string) => string;
  readonly successTitle: string;
  readonly successReference: string;
  readonly successStatus: string;
  readonly successPromise: string;
  readonly successTotal: string;
  readonly successNext: string;
  readonly successKeepReference: string;
  readonly successNoTracking: string;
  /** The link back to this receipt, so a guest need not retype a URL. */
  readonly successOpenReceipt: string;
}

const EN: RequestCopy = {
  title: 'Request this stay',
  intro:
    'Send this to the KAS team and we will confirm availability with you. No payment is taken now.',
  summaryTitle: 'What you are requesting',
  summaryProperty: 'Hotel',
  summaryDates: 'Dates',
  summaryNights: (count) => (count === 1 ? '1 night' : `${count} nights`),
  summaryRooms: 'Rooms',
  summaryAdults: 'Adults',
  summaryEstimate: 'Estimated total',
  guestTitle: 'Your details',
  fullName: 'Full name',
  fullNameHint: 'As it should appear on the booking.',
  email: 'Email',
  emailHint: 'We use this to reply to your request.',
  phone: 'Phone',
  phoneHint: 'Include the country code if you are outside Vietnam.',
  country: 'Country',
  countryHint: 'Two-letter code, for example VN or GB.',
  countryPlaceholder: 'VN',
  preferredChannel: 'Preferred contact method',
  bestTime: 'Best time to reach you',
  notSpecified: 'No preference',
  channelPhone: 'Phone call',
  channelEmail: 'Email',
  channelZalo: 'Zalo',
  channelSms: 'SMS',
  timeMorning: 'Morning',
  timeAfternoon: 'Afternoon',
  timeEvening: 'Evening',
  specialRequests: 'Anything we should know?',
  specialRequestsHint: 'Arrival time, accessibility needs, an occasion we should prepare for.',
  marketingConsent: 'Send me occasional news and offers from KAS.',
  terms: 'I accept the booking terms and the privacy notice.',
  submit: 'Send request',
  submitting: 'Sending your request…',
  noChildren:
    'Stays including children cannot be requested online yet. Please contact the hotel directly.',
  notFinalPrice:
    'This is an estimate for the rooms. The final amount is confirmed by the KAS team.',
  fullNameRequired: 'Please enter your name.',
  emailRequired: 'Please enter your email address.',
  emailInvalid: 'That does not look like an email address.',
  phoneRequired: 'Please enter a phone number.',
  phoneInvalid: 'That does not look like a phone number.',
  countryInvalid: 'Use the two-letter country code, for example VN.',
  termsRequired: 'Please accept the terms before sending your request.',
  fixFields: 'Please check the highlighted fields.',
  errorNoAvailability:
    'These rooms are no longer available for the dates you chose. Please change your dates or your room selection above and try again.',
  errorKeyReused:
    'Your request changed after it was first sent, so it was not submitted again. Please review the details above and send it once more.',
  errorNotFound: 'This hotel is not available for booking right now.',
  errorNetwork:
    'We could not reach KAS. Your request may not have been received — use Try again so it is not sent twice.',
  errorServer: 'Something went wrong on our side. Please try again in a few minutes.',
  receiptErrorTitle: 'The receipt could not be loaded',
  retry: 'Try again',
  reference: (correlationId) => `Reference for support: ${correlationId}`,
  successTitle: 'Your request has been submitted',
  successReference: 'Your reference',
  successStatus: 'Status',
  successPromise: 'We will be in touch',
  successTotal: 'Estimated total',
  successNext:
    'A member of the KAS team will confirm availability and the final amount with you using the contact details you gave.',
  successKeepReference: 'Please keep your reference — quote it whenever you contact us.',
  successOpenReceipt: 'Open this confirmation again',
  successNoTracking:
    'There is no online tracking link for this request yet. We will contact you directly.',
};

const VI: RequestCopy = {
  title: 'Gửi yêu cầu đặt phòng',
  intro:
    'Gửi thông tin này tới đội ngũ KAS, chúng tôi sẽ xác nhận phòng trống với bạn. Chưa thu bất kỳ khoản tiền nào.',
  summaryTitle: 'Nội dung bạn đang yêu cầu',
  summaryProperty: 'Khách sạn',
  summaryDates: 'Ngày lưu trú',
  summaryNights: (count) => `${count} đêm`,
  summaryRooms: 'Phòng',
  summaryAdults: 'Người lớn',
  summaryEstimate: 'Tạm tính',
  guestTitle: 'Thông tin của bạn',
  fullName: 'Họ và tên',
  fullNameHint: 'Tên sẽ hiển thị trên đặt phòng.',
  email: 'Email',
  emailHint: 'Chúng tôi dùng email này để phản hồi yêu cầu của bạn.',
  phone: 'Số điện thoại',
  phoneHint: 'Vui lòng thêm mã quốc gia nếu bạn ở ngoài Việt Nam.',
  country: 'Quốc gia',
  countryHint: 'Mã hai chữ cái, ví dụ VN hoặc GB.',
  countryPlaceholder: 'VN',
  preferredChannel: 'Cách liên hệ mong muốn',
  bestTime: 'Thời điểm thuận tiện',
  notSpecified: 'Không yêu cầu cụ thể',
  channelPhone: 'Gọi điện',
  channelEmail: 'Email',
  channelZalo: 'Zalo',
  channelSms: 'Tin nhắn SMS',
  timeMorning: 'Buổi sáng',
  timeAfternoon: 'Buổi chiều',
  timeEvening: 'Buổi tối',
  specialRequests: 'Bạn có yêu cầu nào khác không?',
  specialRequestsHint: 'Giờ nhận phòng, nhu cầu hỗ trợ tiếp cận, dịp đặc biệt cần chuẩn bị.',
  marketingConsent: 'Gửi cho tôi tin tức và ưu đãi từ KAS.',
  terms: 'Tôi đồng ý với điều khoản đặt phòng và chính sách bảo mật.',
  submit: 'Gửi yêu cầu',
  submitting: 'Đang gửi yêu cầu…',
  noChildren:
    'Hiện chưa thể gửi yêu cầu trực tuyến cho kỳ nghỉ có trẻ em. Vui lòng liên hệ trực tiếp với khách sạn.',
  notFinalPrice:
    'Đây là giá tạm tính cho phòng. Số tiền cuối cùng do đội ngũ KAS xác nhận.',
  fullNameRequired: 'Vui lòng nhập họ và tên.',
  emailRequired: 'Vui lòng nhập địa chỉ email.',
  emailInvalid: 'Địa chỉ email chưa hợp lệ.',
  phoneRequired: 'Vui lòng nhập số điện thoại.',
  phoneInvalid: 'Số điện thoại chưa hợp lệ.',
  countryInvalid: 'Vui lòng dùng mã quốc gia hai chữ cái, ví dụ VN.',
  termsRequired: 'Vui lòng đồng ý với điều khoản trước khi gửi yêu cầu.',
  fixFields: 'Vui lòng kiểm tra lại các mục được đánh dấu.',
  errorNoAvailability:
    'Chưa thể tính giá cho lựa chọn này. Vui lòng liên hệ khách sạn để được hỗ trợ.',
  errorKeyReused:
    'Yêu cầu của bạn đã thay đổi sau lần gửi đầu tiên nên chưa được gửi lại. Vui lòng kiểm tra lại thông tin ở trên và gửi thêm một lần.',
  errorNotFound: 'Hiện chưa thể đặt phòng tại khách sạn này.',
  errorNetwork:
    'Không kết nối được tới KAS. Yêu cầu của bạn có thể chưa được nhận — hãy bấm Thử lại để không gửi trùng.',
  errorServer: 'Đã có lỗi từ phía chúng tôi. Vui lòng thử lại sau ít phút.',
  receiptErrorTitle: 'Không tải được thông tin yêu cầu',
  retry: 'Thử lại',
  reference: (correlationId) => `Mã tra cứu hỗ trợ: ${correlationId}`,
  successTitle: 'Đã gửi yêu cầu của bạn',
  successReference: 'Mã yêu cầu',
  successStatus: 'Trạng thái',
  successPromise: 'Chúng tôi sẽ liên hệ',
  successTotal: 'Tạm tính',
  successNext:
    'Đội ngũ KAS sẽ xác nhận phòng trống và số tiền cuối cùng với bạn qua thông tin liên hệ bạn đã cung cấp.',
  successKeepReference: 'Vui lòng lưu lại mã yêu cầu và cung cấp khi liên hệ với chúng tôi.',
  successOpenReceipt: 'Mở lại xác nhận này',
  successNoTracking:
    'Hiện chưa có liên kết theo dõi trực tuyến cho yêu cầu này. Chúng tôi sẽ liên hệ trực tiếp với bạn.',
};

/** Vietnamese for `vi`, English for everything else — the two frozen locales. */
export function requestCopy(locale: string): RequestCopy {
  return (locale as Locale) === 'vi' ? VI : EN;
}

// ---------------------------------------------------------------------------
// The rest of the booking path — hotel → dates → availability → quote.
//
// The header of this module named the gap it was leaving: "The rest of the guest
// surface is still hardcoded Vietnamese … the seam is widened instead." Step
// 16A.32 found that gap in production — `/en` rendered "Phòng trống", "Còn 6
// phòng" and "Đặt tối đa 5 phòng mỗi lần" — so the seam is widened again rather
// than replaced.
//
// Terminology follows RequestCopy above, which is the same guest reading the
// same flow: a stay has a check-in and a check-out, the departure night is not
// charged, and every price is an estimate until KAS confirms it.
// ---------------------------------------------------------------------------

export interface SearchCopy {
  readonly title: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly checkOutNote: string;
  readonly submit: string;
  readonly bothDatesRequired: string;
  readonly checkInPast: string;
  readonly atLeastOneNight: string;
  readonly comingSoon: string;
  readonly temporarilyClosed: string;
  readonly pickDatesTitle: string;
  readonly pickDatesBody: string;
  readonly cannotLoadTitle: string;
  readonly flagship: string;
  readonly optional: string;
  /** The site header's one link. */
  readonly hotelsNav: string;
  /** The portfolio page — doc 58 §3.1's GET /public/properties. */
  readonly portfolioTitle: string;
  readonly portfolioIntro: string;
  readonly portfolioEmptyTitle: string;
  readonly portfolioEmptyBody: string;
  readonly portfolioNoMatchTitle: string;
  readonly portfolioNoMatchBody: string;
  readonly filterTitle: string;
  readonly filterDistrict: string;
  readonly filterAnyDistrict: string;
  readonly filterAmenity: string;
  readonly filterAnyAmenity: string;
  readonly filterSubmit: string;
  readonly filterClear: string;
  readonly resultCount: (shown: number) => string;
  /** The homepage — the same portfolio, introduced rather than filtered. */
  readonly homeEyebrow: string;
  readonly homeTitle: string;
  readonly homeLead: string;
  readonly homeCollectionTitle: string;
  readonly homeCollectionLead: string;
  readonly homeViewAll: string;
  /** The gallery's "see everything" control, and the breadcrumb trail. */
  readonly viewAllPhotos: string;
  readonly breadcrumbHome: string;
  readonly breadcrumbHotels: string;
}

export interface AvailabilityCopy {
  readonly title: string;
  readonly summaryLabel: string;
  readonly nights: (count: number) => string;
  readonly summary: (bookable: number, total: number) => string;
  readonly noEstimateTitle: string;
  readonly noEstimateBody: string;
  readonly sleeps: (count: number) => string;
  readonly from: string;
  /** How the currency is spoken aloud — ISO 4217 names VND "Dong". */
  readonly vndName: string;
  readonly perNight: string;
  /** Three parts: before the emphasis, the emphasised word, and after it. */
  readonly estimateNote: readonly [string, string, string];
  /** Spoken row label, so a screen reader hears one sentence per room. */
  readonly roomLabel: (
    name: string,
    nights: number,
    price: string,
  ) => string;
}

export interface QuoteCopy {
  readonly title: string;
  readonly roomQuantity: (roomName: string) => string;
  readonly none: string;
  readonly rooms: (count: number) => string;
  readonly adults: string;
  readonly optional: string;
  readonly noChildren: string;
  readonly submit: string;
  readonly pickRooms: string;
  readonly pressToPrice: string;
  readonly failed: string;
  readonly atLeastOneRoom: string;
  readonly adultsRequired: string;
  readonly resultLabel: string;
  readonly resultTitle: (nights: number) => string;
  readonly lineDetail: (nightly: string) => string;
  readonly subtotal: string;
  readonly estimateNote: readonly [string, string, string];
}

const SEARCH: Readonly<Record<Locale, SearchCopy>> = {
  vi: {
    title: 'Chọn ngày ở',
    checkIn: 'Nhận phòng',
    checkOut: 'Trả phòng',
    checkOutNote: 'Đêm trả phòng không tính tiền.',
    submit: 'Xem phòng trống',
    bothDatesRequired: 'Chọn ngày nhận phòng và ngày trả phòng.',
    checkInPast: 'Ngày nhận phòng đã qua. Hãy chọn hôm nay hoặc ngày sau đó.',
    atLeastOneNight: 'Ngày trả phòng phải sau ngày nhận phòng — một kỳ nghỉ ít nhất một đêm.',
    comingSoon: 'Khách sạn này sắp khai trương và chưa mở đặt phòng.',
    temporarilyClosed: 'Khách sạn này đang tạm ngưng nhận khách.',
    pickDatesTitle: 'Chọn ngày để xem phòng trống',
    pickDatesBody: 'Nhập ngày nhận phòng và ngày trả phòng để biết còn phòng nào và giá mỗi đêm.',
    cannotLoadTitle: 'Không xem được phòng trống',
    flagship: 'Khách sạn tiêu biểu',
    optional: 'không bắt buộc',
    hotelsNav: 'Khách sạn',
    portfolioTitle: 'Khách sạn',
    portfolioIntro: 'Các khách sạn KAS đang mở hoặc sắp mở tại Thành phố Hồ Chí Minh.',
    portfolioEmptyTitle: 'Chưa có khách sạn nào được công bố',
    portfolioEmptyBody:
      'Danh sách sẽ xuất hiện tại đây ngay khi khách sạn đầu tiên được duyệt và công bố.',
    portfolioNoMatchTitle: 'Không có khách sạn nào phù hợp',
    portfolioNoMatchBody: 'Thử bỏ bớt bộ lọc để xem toàn bộ danh sách.',
    filterTitle: 'Lọc theo khu vực',
    filterDistrict: 'Quận',
    filterAnyDistrict: 'Tất cả các quận',
    filterAmenity: 'Tiện nghi',
    filterAnyAmenity: 'Mọi tiện nghi',
    filterSubmit: 'Lọc',
    filterClear: 'Xoá bộ lọc',
    resultCount: (shown) => `${shown} khách sạn`,
    homeEyebrow: 'Bộ sưu tập khách sạn KAS',
    homeTitle: 'Những nơi chốn bền lâu.',
    homeLead:
      'Các khách sạn KAS tại Thành phố Hồ Chí Minh, cùng một cam kết về sự tận tâm trong từng kỳ nghỉ.',
    homeCollectionTitle: 'Bộ sưu tập KAS',
    homeCollectionLead: 'Những khách sạn đang mở cửa đón khách.',
    homeViewAll: 'Xem tất cả khách sạn',
    viewAllPhotos: 'Xem tất cả ảnh',
    breadcrumbHome: 'Trang chủ',
    breadcrumbHotels: 'Khách sạn',
  },
  en: {
    title: 'Choose your dates',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    checkOutNote: 'The check-out night is not charged.',
    submit: 'See availability',
    bothDatesRequired: 'Choose a check-in and a check-out date.',
    checkInPast: 'That check-in date has passed. Choose today or a later date.',
    atLeastOneNight: 'Check-out must be after check-in — a stay is at least one night.',
    comingSoon: 'This hotel is opening soon and is not taking bookings yet.',
    temporarilyClosed: 'This hotel is not taking guests at the moment.',
    pickDatesTitle: 'Choose your dates to see what is free',
    pickDatesBody:
      'Enter a check-in and a check-out date to see which rooms are free and the nightly rate.',
    cannotLoadTitle: 'Availability could not be loaded',
    flagship: 'Flagship hotel',
    optional: 'optional',
    hotelsNav: 'Hotels',
    portfolioTitle: 'Hotels',
    portfolioIntro: 'The KAS hotels open or opening in Ho Chi Minh City.',
    portfolioEmptyTitle: 'No hotels published yet',
    portfolioEmptyBody:
      'They will appear here as soon as the first hotel is approved and published.',
    portfolioNoMatchTitle: 'No hotels match',
    portfolioNoMatchBody: 'Try removing a filter to see the whole portfolio.',
    filterTitle: 'Filter by area',
    filterDistrict: 'District',
    filterAnyDistrict: 'All districts',
    filterAmenity: 'Amenity',
    filterAnyAmenity: 'Any amenity',
    filterSubmit: 'Filter',
    filterClear: 'Clear filter',
    resultCount: (shown) => `${shown} ${shown === 1 ? 'hotel' : 'hotels'}`,
    homeEyebrow: 'The KAS hotel collection',
    homeTitle: 'Places that last.',
    homeLead:
      'KAS hotels in Ho Chi Minh City, held to one promise of care across every stay.',
    homeCollectionTitle: 'The KAS collection',
    homeCollectionLead: 'The hotels currently open to guests.',
    homeViewAll: 'View all hotels',
    viewAllPhotos: 'View all photos',
    breadcrumbHome: 'Home',
    breadcrumbHotels: 'Hotels',
  },
};

const AVAILABILITY: Readonly<Record<Locale, AvailabilityCopy>> = {
  vi: {
    title: 'Giá tham khảo loại phòng',
    summaryLabel: 'Tóm tắt giá loại phòng',
    nights: (count) => `${count} đêm`,
    summary: (_bookable, total) => `${total} loại phòng có giá tham khảo.`,
    noEstimateTitle: 'Chưa có giá tham khảo cho ngày này',
    noEstimateBody: 'Hãy thử ngày khác. Nếu bạn cần hỗ trợ, vui lòng liên hệ trực tiếp với khách sạn.',
    sleeps: (count) => `Tối đa ${count} khách`,
    from: 'Từ',
    vndName: 'đồng',
    perNight: 'mỗi đêm',
    estimateNote: [
      'Giá hiển thị là ',
      'ước tính',
      ': mức thấp nhất cho một đêm trong khoảng ngày bạn chọn, tính theo phòng. Tổng tiền cho cả kỳ nghỉ sẽ được xác nhận ở bước đặt phòng.',
    ],
    roomLabel: (name, nightCount, price) =>
      `${name}. ${nightCount} đêm. Giá tham khảo ${price} mỗi đêm. Khách sạn sẽ kiểm tra phòng.`,
  },
  en: {
    title: 'Room price estimates',
    summaryLabel: 'Room price summary',
    nights: (count) => `${count} ${count === 1 ? 'night' : 'nights'}`,
    summary: (_bookable, total) =>
      `${total} room ${total === 1 ? 'type' : 'types'} with price estimates.`,
    noEstimateTitle: 'No price estimate for these dates',
    noEstimateBody: 'Try different dates. If you need help, please contact the hotel directly.',
    sleeps: (count) => `Sleeps ${count}`,
    from: 'From',
    vndName: 'dong',
    perNight: 'per night',
    estimateNote: [
      'The price shown is an ',
      'estimate',
      ': the lowest nightly rate across your chosen dates, per room. The total for the whole stay is confirmed when you request the booking.',
    ],
    roomLabel: (name, nightCount, price) =>
      `${name}. ${nightCount} nights. Estimated from ${price} per night. Hotel confirmation required.`,
  },
};

const QUOTE: Readonly<Record<Locale, QuoteCopy>> = {
  vi: {
    title: 'Chọn phòng và xem giá',
    roomQuantity: (roomName) => `Số phòng — ${roomName}`,
    none: 'Không chọn',
    rooms: (count) => `${count} phòng`,
    adults: 'Số khách người lớn',
    optional: 'không bắt buộc',
    noChildren:
      'Hiện chưa thể báo giá trực tuyến cho kỳ nghỉ có trẻ em. Vui lòng liên hệ trực tiếp với khách sạn.',
    submit: 'Xem giá',
    pickRooms: 'Chọn số phòng để xem giá cho cả kỳ nghỉ.',
    pressToPrice: 'Bấm “Xem giá” để tính giá cho lựa chọn này.',
    failed: 'Hiện chưa thể tính giá. Vui lòng thử lại sau ít phút.',
    atLeastOneRoom: 'Chọn ít nhất một phòng.',
    adultsRequired: 'Nhập số khách người lớn.',
    resultLabel: 'Giá tạm tính',
    resultTitle: (nights) => `Tạm tính cho ${nights} đêm`,
    lineDetail: (nightly) => `từ ${nightly} / phòng / đêm`,
    subtotal: 'Tạm tính',
    estimateNote: [
      'Đây là ',
      'giá tạm tính',
      ' cho phòng, chưa phải yêu cầu đặt phòng. Số tiền cuối cùng do KAS xác nhận.',
    ],
  },
  en: {
    title: 'Choose rooms and see the price',
    roomQuantity: (roomName) => `Rooms — ${roomName}`,
    none: 'None',
    rooms: (count) => `${count} ${count === 1 ? 'room' : 'rooms'}`,
    adults: 'Adults',
    optional: 'optional',
    noChildren:
      'Stays with children cannot be priced online yet. Please contact the hotel directly.',
    submit: 'See the price',
    pickRooms: 'Choose how many rooms to see the price for the whole stay.',
    pressToPrice: 'Press “See the price” to price this selection.',
    failed: 'The price cannot be calculated right now. Please try again in a few minutes.',
    atLeastOneRoom: 'Choose at least one room.',
    adultsRequired: 'Enter the number of adults.',
    resultLabel: 'Estimated price',
    resultTitle: (nights) => `Estimate for ${nights} ${nights === 1 ? 'night' : 'nights'}`,
    lineDetail: (nightly) => `from ${nightly} / room / night`,
    subtotal: 'Estimate',
    estimateNote: [
      'This is an ',
      'estimated price',
      ' for the rooms, not a booking request yet. The final amount is confirmed by KAS.',
    ],
  },
};

/** Falls back to English, exactly as {@link requestCopy} does. */
export function searchCopy(locale: string): SearchCopy {
  return locale === 'vi' ? SEARCH.vi : SEARCH.en;
}

export function availabilityCopy(locale: string): AvailabilityCopy {
  return locale === 'vi' ? AVAILABILITY.vi : AVAILABILITY.en;
}

export function quoteCopy(locale: string): QuoteCopy {
  return locale === 'vi' ? QUOTE.vi : QUOTE.en;
}
