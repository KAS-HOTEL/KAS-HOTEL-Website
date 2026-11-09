import type { Locale } from '@/config/env';

/**
 * Guest copy for the booking surface — the search bar, the room selection and
 * the stay summary.
 *
 * <h2>Why a second copy module</h2>
 *
 * `requestMessages.ts` is already 560 lines covering the reservation request,
 * the availability results and the portfolio. These three components are the
 * booking surface introduced in STEP J and they are read together; keeping them
 * in one place makes a wording change one file rather than a search. The shape
 * is identical to its sibling — an interface, one record per frozen locale, and
 * an accessor that falls back to English — so both are replaced by the same i18n
 * layer when it arrives.
 *
 * <h2>What these strings are not allowed to say</h2>
 *
 * Nothing here claims a room is held, a price is final, or a booking is made.
 * A quote creates nothing (doc 58 §11.2.2) and every displayed figure is an
 * estimate until the price snapshot is written at `REQUESTED` (doc 56 §5.1), so
 * the estimate wording is part of the contract rather than a disclaimer bolted
 * on.
 */

/**
 * The search bar's words.
 *
 * `childrenNote` is not a nicety. Config B10 (child pricing and age bands) is
 * OPEN, the backend refuses any request carrying children with
 * `422 CONFIG_MISSING`, and doc 26 §7.4 states the selector must not offer a
 * child count in V1 — so a guest travelling with children has to be told here
 * rather than after filling the form in.
 */
export interface StaySearchCopy {
  readonly title: string;
  readonly destination: string;
  readonly anyDestination: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly checkOutNote: string;
  readonly adults: string;
  readonly rooms: string;
  readonly submit: string;
  readonly childrenNote: string;
}

/** The room list, once dates have been chosen. */
export interface RoomSelectionCopy {
  readonly manualReview: string;
  readonly title: string;
  readonly resultsLabel: string;
  readonly summary: (bookable: number, total: number) => string;
  readonly nights: (count: number) => string;
  readonly loading: string;
  readonly noEstimateTitle: string;
  readonly noEstimateBody: string;
  readonly errorTitle: string;
  readonly retry: string;
  readonly pickDatesTitle: string;
  readonly pickDatesBody: string;
  readonly from: string;
  readonly perNight: string;
  readonly occupancy: string;
  readonly adults: (count: number) => string;
  readonly children: (count: number) => string;
  readonly sleeps: (count: number) => string;
  readonly area: string;
  readonly beds: string;
  readonly smoking: string;
  readonly smokingAllowed: string;
  readonly smokingNotAllowed: string;
  readonly bed: (count: number, type: string) => string;
  readonly quantity: (roomName: string) => string;
  readonly none: string;
  readonly roomCount: (count: number) => string;
  readonly choose: string;
  readonly chosen: (count: number) => string;
  /** Published capacity — a fact from the room description, not an inventory claim. */
  readonly fitsParty: (adults: number) => string;
  readonly tooSmall: string;
  readonly estimateNote: readonly [string, string, string];
  /** How the currency is spoken aloud — ISO 4217 names VND "Dong". */
  readonly vndName: string;
  readonly roomLabel: (
    name: string,
    nights: number,
    price: string,
  ) => string;
}

/** The persistent panel that follows the guest down the page. */
export interface StaySummaryCopy {
  readonly title: string;
  readonly label: string;
  readonly nights: (count: number) => string;
  readonly party: (adults: number, rooms: number) => string;
  readonly noDates: string;
  readonly empty: string;
  readonly pricing: string;
  readonly priceIt: string;
  readonly total: string;
  readonly lineDetail: (nightly: string) => string;
  readonly estimateNote: readonly [string, string, string];
  readonly failed: string;
  readonly stickyCount: (rooms: number) => string;
  readonly stickyNone: string;
  readonly changed: string;
  readonly changedLine: (name: string, from: number, to: number) => string;
  readonly dropped: (name: string) => string;
}

const STAY_SEARCH: Readonly<Record<Locale, StaySearchCopy>> = {
  vi: {
    title: 'Tìm phòng',
    destination: 'Khu vực',
    anyDestination: 'Tất cả các quận',
    checkIn: 'Nhận phòng',
    checkOut: 'Trả phòng',
    checkOutNote: 'Đêm trả phòng không tính tiền.',
    adults: 'Người lớn',
    rooms: 'Số phòng',
    submit: 'Xem loại phòng và giá',
    childrenNote:
      'Hiện chưa thể đặt trực tuyến cho kỳ nghỉ có trẻ em. Vui lòng liên hệ trực tiếp với khách sạn.',
  },
  en: {
    title: 'Find a room',
    destination: 'Area',
    anyDestination: 'All districts',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    checkOutNote: 'The check-out night is not charged.',
    adults: 'Adults',
    rooms: 'Rooms',
    submit: 'View rooms and prices',
    childrenNote:
      'Stays with children cannot be booked online yet. Please contact the hotel directly.',
  },
};

const ROOM_SELECTION: Readonly<Record<Locale, RoomSelectionCopy>> = {
  vi: {
    manualReview: 'Khách sạn sẽ kiểm tra phòng và xác nhận yêu cầu của bạn.',
    title: 'Chọn loại phòng để gửi yêu cầu',
    resultsLabel: 'Kết quả tìm phòng',
    summary: (_bookable, total) => `${total} loại phòng có giá tham khảo`,
    nights: (count) => `${count} đêm`,
    loading: 'Đang tải loại phòng và giá…',
    noEstimateTitle: 'Chưa có giá tham khảo cho ngày này',
    noEstimateBody: 'Vui lòng liên hệ khách sạn để được báo giá và kiểm tra phòng.',
    errorTitle: 'Không tải được loại phòng và giá',
    retry: 'Thử lại',
    pickDatesTitle: 'Chọn ngày để xem giá tham khảo',
    pickDatesBody: 'Chọn ngày và loại phòng để gửi yêu cầu. Khách sạn kiểm tra phòng thủ công.',
    from: 'từ',
    perNight: '/ đêm',
    occupancy: 'Sức chứa',
    adults: (count) => `${count} người lớn`,
    children: (count) => `${count} trẻ em`,
    sleeps: (count) => `tối đa ${count} khách`,
    area: 'Diện tích',
    beds: 'Giường',
    smoking: 'Hút thuốc',
    smokingAllowed: 'Cho phép hút thuốc',
    smokingNotAllowed: 'Không hút thuốc',
    bed: (count, type) => `${count} × ${type}`,
    quantity: (roomName) => `Số phòng — ${roomName}`,
    none: 'Không chọn',
    roomCount: (count) => `${count} phòng`,
    choose: 'Chọn phòng',
    chosen: (count) => `Đã chọn ${count} phòng`,
    fitsParty: (adults) => `Đủ chỗ cho ${adults} người lớn`,
    tooSmall: 'Cần nhiều hơn số phòng bạn đang chọn',
    estimateNote: [
      'Giá hiển thị là ',
      'giá thấp nhất mỗi đêm',
      ' cho một phòng trong khoảng ngày bạn chọn, chưa phải tổng tiền kỳ nghỉ.',
    ],
    vndName: 'đồng',
    roomLabel: (name, nightCount, price) =>
      `${name}. ${nightCount} đêm. Giá tham khảo ${price} mỗi đêm. Khách sạn sẽ kiểm tra phòng.`,
  },
  en: {
    manualReview: 'The hotel will check room availability and respond to your request.',
    title: 'Choose a room type to request',
    resultsLabel: 'Availability results',
    summary: (_bookable, total) =>
      `${total} room ${total === 1 ? 'type' : 'types'} with price estimates`,
    nights: (count) => `${count} ${count === 1 ? 'night' : 'nights'}`,
    loading: 'Loading room types and prices…',
    noEstimateTitle: 'No price estimate for these dates',
    noEstimateBody: 'Contact the hotel for a quote and a manual room check.',
    errorTitle: 'Room types and prices could not be loaded',
    retry: 'Try again',
    pickDatesTitle: 'Choose dates to see price estimates',
    pickDatesBody:
      'Choose dates and room types to request. The hotel checks availability manually.',
    from: 'from',
    perNight: '/ night',
    occupancy: 'Occupancy',
    adults: (count) => `${count} ${count === 1 ? 'adult' : 'adults'}`,
    children: (count) => `${count} ${count === 1 ? 'child' : 'children'}`,
    sleeps: (count) => `sleeps ${count}`,
    area: 'Size',
    beds: 'Beds',
    smoking: 'Smoking',
    smokingAllowed: 'Smoking allowed',
    smokingNotAllowed: 'Non-smoking',
    bed: (count, type) => `${count} × ${type}`,
    quantity: (roomName) => `Rooms — ${roomName}`,
    none: 'None',
    roomCount: (count) => `${count} ${count === 1 ? 'room' : 'rooms'}`,
    choose: 'Choose room',
    chosen: (count) => `${count} ${count === 1 ? 'room' : 'rooms'} chosen`,
    fitsParty: (adults) => `Sleeps your ${adults}`,
    tooSmall: 'More rooms needed than you have selected',
    estimateNote: [
      'The price shown is the ',
      'lowest nightly rate',
      ' for one room across your dates, not the total for the stay.',
    ],
    vndName: 'Dong',
    roomLabel: (name, nightCount, price) =>
      `${name}. ${nightCount} nights. Estimated from ${price} per night. Hotel confirmation required.`,
  },
};

const STAY_SUMMARY: Readonly<Record<Locale, StaySummaryCopy>> = {
  vi: {
    title: 'Kỳ nghỉ của bạn',
    label: 'Tóm tắt kỳ nghỉ',
    nights: (count) => `${count} đêm`,
    party: (adults, rooms) => `${adults} người lớn · ${rooms} phòng`,
    noDates: 'Chọn ngày nhận phòng và trả phòng để bắt đầu.',
    empty: 'Chưa chọn phòng nào.',
    pricing: 'Đang tính giá…',
    priceIt: 'Xem giá kỳ nghỉ',
    total: 'Tạm tính',
    lineDetail: (nightly) => `từ ${nightly} / phòng / đêm`,
    estimateNote: [
      'Đây là ',
      'giá tạm tính',
      ' cho phòng, chưa phải yêu cầu đặt phòng. Số tiền cuối cùng do KAS xác nhận.',
    ],
    failed: 'Hiện chưa thể tính giá. Vui lòng thử lại sau ít phút.',
    stickyCount: (rooms) => `${rooms} phòng đã chọn`,
    stickyNone: 'Chưa chọn phòng',
    changed: 'Lựa chọn của bạn đã được cập nhật theo danh sách loại phòng:',
    changedLine: (name, from, to) => `${name}: ${from} phòng → ${to} phòng`,
    dropped: (name) => `${name}: không còn trong danh sách yêu cầu`,
  },
  en: {
    title: 'Your stay',
    label: 'Stay summary',
    nights: (count) => `${count} ${count === 1 ? 'night' : 'nights'}`,
    party: (adults, rooms) =>
      `${adults} ${adults === 1 ? 'adult' : 'adults'} · ${rooms} ${rooms === 1 ? 'room' : 'rooms'}`,
    noDates: 'Choose your check-in and check-out dates to begin.',
    empty: 'No rooms chosen yet.',
    pricing: 'Pricing your stay…',
    priceIt: 'See the price',
    total: 'Estimate',
    lineDetail: (nightly) => `from ${nightly} / room / night`,
    estimateNote: [
      'This is an ',
      'estimated price',
      ' for the rooms, not a booking request yet. The final amount is confirmed by KAS.',
    ],
    failed: 'The price cannot be calculated right now. Please try again in a few minutes.',
    stickyCount: (rooms) => `${rooms} ${rooms === 1 ? 'room' : 'rooms'} chosen`,
    stickyNone: 'No rooms chosen',
    changed: 'Your selection was updated to match what is still available:',
    changedLine: (name, from, to) => `${name}: ${from} → ${to} rooms`,
    dropped: (name) => `${name}: no longer available for these dates`,
  },
};

/** Falls back to English, exactly as the sibling copy module does. */
export function staySearchCopy(locale: string): StaySearchCopy {
  return locale === 'vi' ? STAY_SEARCH.vi : STAY_SEARCH.en;
}

export function roomSelectionCopy(locale: string): RoomSelectionCopy {
  return locale === 'vi' ? ROOM_SELECTION.vi : ROOM_SELECTION.en;
}

export function staySummaryCopy(locale: string): StaySummaryCopy {
  return locale === 'vi' ? STAY_SUMMARY.vi : STAY_SUMMARY.en;
}
