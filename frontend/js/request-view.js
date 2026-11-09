/* Server reservation data and explicit lifecycle states; never inferred from calendar dates. */
(function(global){
  'use strict';
  function state(b,vi){
    var s=b.stayStatus || b.salesStatus || b.status || 'REQUESTED';
    var labels={REQUESTED:['Đã gửi yêu cầu — chờ khách sạn','Request sent — awaiting hotel review'],PENDING:['Đã gửi yêu cầu — chờ khách sạn','Request sent — awaiting hotel review'],ASSIGNED:['Khách sạn đang xem xét','Hotel reviewing'],AVAILABILITY_CHECK:['Khách sạn đang xem xét','Hotel reviewing'],CUSTOMER_CONTACTED:['Khách sạn đang liên hệ','Hotel contacting you'],ALTERNATIVE_OFFERED:['Yêu cầu đã kết thúc — KAS đã gửi phương án khác qua email, vui lòng tạo yêu cầu mới nếu phù hợp','Request closed — KAS emailed an alternative; please send a new request if it suits you'],PAYMENT_PENDING:['Khách sạn đã duyệt — chờ thanh toán','Hotel approved — awaiting payment'],WON:['Đặt phòng đã được xác nhận','Booking confirmed'],CONFIRMED:['Đặt phòng đã được xác nhận','Booking confirmed'],CHECK_IN_READY:['Đã xác nhận — chuẩn bị nhận phòng','Confirmed — preparing for arrival'],CHECKED_IN:['Đã nhận phòng','Checked in'],CHECKED_OUT:['Đã trả phòng','Checked out'],COMPLETED:['Đã hoàn tất lưu trú','Stay completed'],CANCELLED:['Đã hủy','Cancelled'],DECLINED:['Khách sạn từ chối yêu cầu','Request declined'],LOST:['Yêu cầu đã kết thúc','Request closed'],EXPIRED:['Yêu cầu hết hạn','Request expired'],NO_SHOW:['Không đến nhận phòng','No-show']};
    var stage={REQUESTED:0,PENDING:0,ASSIGNED:1,AVAILABILITY_CHECK:1,CUSTOMER_CONTACTED:1,PAYMENT_PENDING:2,WON:3,CONFIRMED:3,CHECK_IN_READY:3,CHECKED_IN:3,CHECKED_OUT:3,COMPLETED:3}[s];
    return {code:s,label:labels[s] ? labels[s][vi?0:1] : (vi?'Cần kiểm tra trạng thái':'Status unavailable'),stage:stage==null?-1:stage};
  }
  function map(stay,profile){
    var D=global.KAS_DATA, U=global.U;
    var roomKey=Object.keys(global.KAS_API_MAP || {}).find(function(key){return global.KAS_API_MAP[key].propertySlug===stay.propertySlug;});
    var hotel=roomKey && D.getHotel('hotel-'+roomKey.slice(1,3));
    return {backend:true,live:true,bookingNumber:stay.reference,hotelId:hotel && hotel.id,hotelName:stay.propertyName || (hotel && hotel.name) || stay.propertySlug,
      hotelAddress:hotel && hotel.address || '',roomImage:hotel && hotel.images && hotel.images[0] || '',roomName:stay.roomName || '',
      checkIn:stay.checkIn,checkOut:stay.checkOut,checkInTime:stay.checkInTime,checkOutTime:stay.checkOutTime,nights:stay.nights,
      adults:stay.adults,children:stay.children,rooms:stay.rooms,total:stay.totalMinor,roomRate:stay.subtotalMinor,currency:stay.currency,
      salesStatus:stay.salesStatus,stayStatus:stay.stayStatus,status:stay.stayStatus || stay.salesStatus,
      createdAt:stay.createdAt,guest:{fullName:stay.guestName || profile.fullName,email:stay.guestEmail || profile.email},specialRequests:stay.specialRequests,
      paymentVerifiedAt:stay.paymentVerifiedAt,cancellationRequestId:stay.cancellationRequestId,cancellationRequestStatus:stay.cancellationRequestStatus,checkoutRequestedAt:stay.checkoutRequestedAt,checkoutRequestSource:stay.checkoutRequestSource,
      cancellationFeeMinor:stay.cancellationFeeMinor,cancellationFeeCurrency:stay.cancellationFeeCurrency,cancellationFeeNote:stay.cancellationFeeNote};
  }
  function money(amount,currency){return amount==null || !Number.isFinite(Number(amount)) ? '—' : new Intl.NumberFormat('vi-VN',{style:'currency',currency:currency || 'VND'}).format(Number(amount)/(currency==='VND' || !currency?1:100));}
  function timeline(b,vi){
    var st=state(b,vi), labels=vi?['Đã gửi yêu cầu','Khách sạn xem xét','Chờ thanh toán','Đã xác nhận']:['Request sent','Hotel review','Awaiting payment','Confirmed'];
    if(st.stage<0)return '<p role="status">'+global.U.esc(st.label)+'</p>';
    return '<div class="mykas-timeline" aria-label="'+(vi?'Tiến độ yêu cầu':'Request progress')+'">'+labels.map(function(label,i){return '<span class="'+(i<st.stage?'is-complete':i===st.stage?'is-current':'')+'"'+(i===st.stage?' aria-current="step"':'')+'><i>'+(i<st.stage?'✓':'')+'</i>'+global.U.esc(label)+'</span>';}).join('')+'</div>';
  }
  function details(b,vi){
    var U=global.U,st=state(b,vi), e=U.esc;
    function field(label,value){return '<div><dt>'+e(label)+'</dt><dd>'+e(value==null || value===''?'—':String(value))+'</dd></div>';}
    var payment=b.paymentVerifiedAt ? (vi?'Khách sạn đã xác nhận nhận tiền':'Hotel verified receipt of payment') : b.salesStatus==='PAYMENT_PENDING' ? (vi?'Chờ khách chuyển khoản và khách sạn kiểm tra':'Awaiting transfer and hotel verification') : (vi?'Chưa có xác nhận thanh toán':'No payment has been verified');
    return '<div class="card"><h2>'+e(b.hotelName)+'</h2><p>'+e(b.bookingNumber)+' · <strong>'+e(st.label)+'</strong></p>'+
      '<p class="muted">'+(st.stage<3?(vi?'Đây là yêu cầu đặt phòng. Chỉ hoàn tất xác nhận sau khi khách sạn kiểm tra phòng và thanh toán.':'This is a booking request. Confirmation follows the hotel review and payment verification.'):'')+'</p>'+
      timeline(b,vi)+'<div class="divider"></div><dl class="dl">'+field(vi?'Nhận phòng':'Check-in',U.fmtDate(b.checkIn)+(b.checkInTime?' · '+b.checkInTime:''))+field(vi?'Trả phòng':'Check-out',U.fmtDate(b.checkOut)+(b.checkOutTime?' · '+b.checkOutTime:''))+
      field(vi?'Số đêm':'Nights',b.nights)+field(vi?'Hạng phòng':'Room',b.roomName)+field(vi?'Người lớn / Trẻ em / Phòng':'Adults / Children / Rooms',[b.adults,b.children,b.rooms].map(function(x){return x==null?'—':x;}).join(' / '))+
      field(vi?'Khách đại diện':'Lead guest',b.guest && b.guest.fullName)+field('Email',b.guest && b.guest.email)+field(vi?'Thanh toán':'Payment',payment)+'</dl>'+
      '<div class="divider"></div><div class="prow prow--total"><span>'+(vi?'Giá trị yêu cầu':'Request amount')+'</span><strong>'+e(money(b.total,b.currency))+'</strong></div>'+
      (b.specialRequests?'<p>'+e(b.specialRequests)+'</p>':'')+'<p class="muted">'+(vi?'Điều kiện và phí hủy được khách sạn thông báo theo yêu cầu. Gửi yêu cầu hủy chưa đồng nghĩa đã hủy đặt phòng.':'The hotel communicates cancellation terms and any applicable fee. Requesting cancellation does not itself cancel the booking.')+'</p><div id="mbActions" class="actions"></div></div>';
  }
  global.KAS_REQUEST_VIEW={state:state,map:map,timeline:timeline,details:details,money:money};
})(window);
