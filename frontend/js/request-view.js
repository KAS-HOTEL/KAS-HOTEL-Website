/* Server reservation data and explicit lifecycle states; never inferred from calendar dates. */
(function(global){
  'use strict';
  function state(b,vi){
    var s=b.stayStatus || b.salesStatus || b.status || 'REQUESTED';
    var labels={REQUESTED:['Đã gửi yêu cầu — chờ khách sạn','Request sent — awaiting hotel review'],PENDING:['Đã gửi yêu cầu — chờ khách sạn','Request sent — awaiting hotel review'],ASSIGNED:['Khách sạn đang xem xét','Hotel reviewing'],AVAILABILITY_CHECK:['Khách sạn đang xem xét','Hotel reviewing'],CUSTOMER_CONTACTED:['Khách sạn đang liên hệ','Hotel contacting you'],ALTERNATIVE_OFFERED:['Yêu cầu đã kết thúc — KAS đã gửi phương án khác qua email, vui lòng tạo yêu cầu mới nếu phù hợp','Request closed — KAS emailed an alternative; please send a new request if it suits you'],PAYMENT_PENDING:['Khách sạn đã duyệt — chờ thanh toán','Hotel approved — awaiting payment'],WON:['Đặt phòng đã được xác nhận','Booking confirmed'],CONFIRMED:['Đặt phòng đã được xác nhận','Booking confirmed'],CHECK_IN_READY:['Đã xác nhận — chuẩn bị nhận phòng','Confirmed — preparing for arrival'],CHECKED_IN:['Đã nhận phòng','Checked in'],CHECKED_OUT:['Đã hoàn tất lưu trú','Stay completed'],COMPLETED:['Đã hoàn tất lưu trú','Stay completed'],CANCELLED:['Đã hủy','Cancelled'],DECLINED:['Khách sạn từ chối yêu cầu','Request declined'],LOST:['Yêu cầu đã kết thúc','Request closed'],EXPIRED:['Yêu cầu hết hạn','Request expired'],NO_SHOW:['Không đến nhận phòng','No-show']};
    var stage={REQUESTED:0,PENDING:0,ASSIGNED:1,AVAILABILITY_CHECK:1,CUSTOMER_CONTACTED:1,PAYMENT_PENDING:2,WON:3,CONFIRMED:3,CHECK_IN_READY:3,CHECKED_IN:3,CHECKED_OUT:3,COMPLETED:3}[s];
    return {code:s,label:labels[s] ? labels[s][vi?0:1] : (vi?'Cần kiểm tra trạng thái':'Status unavailable'),stage:stage==null?-1:stage};
  }
  /* Booking group for the My KAS tabs (2026-11-12). Unsuccessful requests (expired, declined,
     closed) sit with cancelled ones and never in Upcoming / In progress. */
  var UNSUCCESSFUL={CANCELLED:1,EXPIRED:1,DECLINED:1,LOST:1,ALTERNATIVE_OFFERED:1,NO_SHOW:1};
  var DONE={COMPLETED:1,CHECKED_OUT:1};
  var CONFIRMED={WON:1,CONFIRMED:1,CHECK_IN_READY:1,CHECKED_IN:1};
  function group(b){
    var s=state(b,false).code;
    if(UNSUCCESSFUL[s])return 'cancelled';
    if(DONE[s])return 'completed';
    if(CONFIRMED[s])return 'upcoming';
    return 'processing';
  }
  /* Payment status, apart from the booking status. The server value wins; older servers
     without it fall back to the verified-payment timestamp. */
  function payment(b,vi){
    var code=b.paymentStatus;
    if(!code){code=b.refundAmountMinor>0?'REFUNDED':b.paymentVerifiedAt?'PAID':b.salesStatus==='PAYMENT_PENDING'?'UNPAID':'NONE';}
    var labels={PAID:['Đã thanh toán','Paid'],PENDING:['Đã báo chuyển khoản — chờ khách sạn kiểm tra','Transfer reported — hotel checking'],
      UNPAID:['Chưa thanh toán','Unpaid'],REFUNDED:['Đã hoàn tiền','Refunded'],NONE:['Chưa có xác nhận thanh toán','No payment confirmed yet']};
    return {code:code,label:(labels[code]||labels.NONE)[vi?0:1]};
  }
  /* Why a request ended without a stay, from the recorded status history. */
  function endedReason(b,vi){
    var s=state(b,vi).code, r=b.salesStatusReason;
    if(s==='EXPIRED'){
      if(r==='PAYMENT_DEADLINE')return vi?'Yêu cầu đặt phòng đã hết hạn vì chưa thanh toán trước hạn.':'The booking request expired because payment was not made by the deadline.';
      return vi?'Yêu cầu đặt phòng đã hết hạn. Khách sạn chưa phản hồi trong thời hạn quy định.':'The booking request has expired. The hotel did not respond within the required time.';
    }
    if(s==='DECLINED')return vi?'Khách sạn đã từ chối yêu cầu đặt phòng.':'The hotel declined this booking request.';
    if(s==='ALTERNATIVE_OFFERED'||s==='LOST')return vi?'Yêu cầu đã kết thúc. Bạn có thể gửi yêu cầu mới bất cứ lúc nào.':'This request is closed. You can send a new request at any time.';
    if(s==='CANCELLED')return vi?'Đặt phòng đã được hủy.':'This booking was cancelled.';
    return '';
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
      cancellationFeeMinor:stay.cancellationFeeMinor,cancellationFeeCurrency:stay.cancellationFeeCurrency,cancellationFeeNote:stay.cancellationFeeNote,refundDueMinor:stay.refundDueMinor,refundAmountMinor:stay.refundAmountMinor,
      paymentStatus:stay.paymentStatus,paymentDueAt:stay.paymentDueAt,salesStatusReason:stay.salesStatusReason,
      reservationId:stay.reservationId,reviewStatus:stay.reviewStatus,reviewOverall:stay.reviewOverall};
  }
  function money(amount,currency){return amount==null || !Number.isFinite(Number(amount)) ? '—' : new Intl.NumberFormat('vi-VN',{style:'currency',currency:currency || 'VND'}).format(Number(amount)/(currency==='VND' || !currency?1:100));}
  function timeline(b,vi){
    var st=state(b,vi), pay=payment(b,vi);
    /* The payment step reads what really happened: "Paid" once paid, "Awaiting payment" only
       while it is the current step; "Confirmed" completes only when the booking is confirmed. */
    var paymentStep=pay.code==='PAID'||pay.code==='REFUNDED'?(vi?'Đã thanh toán':'Paid')
      :st.stage===2?(pay.code==='PENDING'?(vi?'Đang kiểm tra thanh toán':'Checking payment'):(vi?'Chờ thanh toán':'Awaiting payment'))
      :(vi?'Thanh toán':'Payment');
    var labels=vi?['Đã gửi yêu cầu','Khách sạn xem xét',paymentStep,'Đã xác nhận']:['Request sent','Hotel review',paymentStep,'Confirmed'];
    if(st.stage<0)return '<p role="status">'+global.U.esc(st.label)+'</p>';
    return '<div class="mykas-timeline" aria-label="'+(vi?'Tiến độ yêu cầu':'Request progress')+'">'+labels.map(function(label,i){var done=i<st.stage||st.stage===3;return '<span class="'+(done?'is-complete':i===st.stage?'is-current':'')+'"'+(i===st.stage?' aria-current="step"':'')+'><i>'+(done?'✓':'')+'</i>'+global.U.esc(label)+'</span>';}).join('')+'</div>';
  }
  /* Booking detail (2026-11-12): header, timeline, stay, guest, price, cancellation, actions.
     Only amounts the booking actually records are shown; nothing is recomputed here. */
  function details(b,vi){
    var U=global.U,st=state(b,vi), e=U.esc, pay=payment(b,vi), ended=endedReason(b,vi), g=group(b);
    function field(label,value){return '<div><dt>'+e(label)+'</dt><dd>'+e(value==null || value===''?'—':String(value))+'</dd></div>';}
    function section(title,body){return '<section class="mykas-detail__section"><h3 class="mykas-detail__h">'+e(title)+'</h3>'+body+'</section>';}
    function row(label,value,strong){return '<div class="prow'+(strong?' prow--total':'')+'"><span>'+e(label)+'</span>'+(strong?'<strong>':'<span>')+e(value)+(strong?'</strong>':'</span>')+'</div>';}
    var paidMinor=pay.code==='PAID'||pay.code==='REFUNDED'?b.total:0;
    var tone=g==='cancelled'?'muted':g==='processing'?'warn':'ok', payTone=pay.code==='PAID'?'ok':pay.code==='UNPAID'||pay.code==='PENDING'?'warn':'muted';
    var due=b.paymentDueAt?new Date(b.paymentDueAt).toLocaleString(vi?'vi-VN':'en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'';
    /* When the request was sent (2026-11-12), in KAS business time. */
    var bookedAt=b.createdAt?new Date(b.createdAt).toLocaleString(vi?'vi-VN':'en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'';
    var price=(b.roomRate!=null&&b.roomRate!==b.total?row(vi?'Tiền phòng ('+(b.nights||'—')+' đêm)':'Rooms ('+(b.nights||'—')+' nights)',money(b.roomRate,b.currency))+row(vi?'Thuế, phí và ưu đãi':'Taxes, fees and discounts',money(b.total-b.roomRate,b.currency)):'')+
      row(vi?'Tổng tiền':'Total',money(b.total,b.currency),true)+
      (pay.code==='PAID'?row(vi?'Đã thanh toán':'Paid',money(paidMinor,b.currency))+row(vi?'Còn lại':'Remaining',money(0,b.currency)):'')+
      (pay.code==='REFUNDED'&&b.refundAmountMinor!=null?row(vi?'Đã hoàn':'Refunded',money(b.refundAmountMinor,b.cancellationFeeCurrency||b.currency)):'')+
      (pay.code==='UNPAID'||pay.code==='PENDING'?row(vi?'Cần thanh toán':'To pay',money(b.total,b.currency))+(due?row(vi?'Hạn thanh toán':'Pay by',due):''):'');
    var hotelLink=b.hotelId?'<a class="btn btn--ghost" href="hotel-detail.html?hotel='+encodeURIComponent(b.hotelId)+'">'+(vi?'Xem khách sạn':'View hotel')+'</a>':'';
    var supportLink='<a class="btn btn--ghost" href="support.html#contact" data-support-ref="'+e(b.bookingNumber)+'">'+(vi?'Liên hệ hỗ trợ':'Contact support')+'</a>';
    return '<div class="card mykas-detail">'+
      '<header class="mykas-detail__head"><p class="mykas-detail__ref">'+(vi?'MÃ ĐẶT PHÒNG ':'BOOKING ')+e(b.bookingNumber)+(bookedAt?' · '+(vi?'ĐẶT LÚC ':'BOOKED ')+e(bookedAt):'')+'</p><h2 class="mykas-detail__hotel">'+e(b.hotelName)+'</h2>'+
        '<div class="mykas-pills" style="justify-content:flex-start"><span class="mykas-pill mykas-pill--'+tone+'">'+e(st.label)+'</span>'+(pay.code==='NONE'&&g!=='processing'?'':'<span class="mykas-pill mykas-pill--'+payTone+'">'+e(pay.label)+'</span>')+'</div></header>'+
      (ended?'<p class="mykas-ended" role="status">'+e(ended)+'</p>':'')+
      (g==='processing'?'<p class="muted">'+(vi?'Đây là yêu cầu đặt phòng. Đặt phòng chỉ được xác nhận sau khi khách sạn kiểm tra phòng và nhận thanh toán.':'This is a booking request. It is confirmed only after the hotel checks availability and the payment is received.')+'</p>':'')+
      (g==='cancelled'?'':section(vi?'Tiến độ':'Progress',timeline(b,vi)))+
      section(vi?'Thông tin lưu trú':'Stay',
        '<dl class="dl">'+(bookedAt?field(vi?'Thời gian đặt':'Booked on',bookedAt):'')+field(vi?'Nhận phòng':'Check-in',U.fmtDate(b.checkIn)+(b.checkInTime?' · '+b.checkInTime:''))+field(vi?'Trả phòng':'Check-out',U.fmtDate(b.checkOut)+(b.checkOutTime?' · '+b.checkOutTime:''))+
        field(vi?'Số đêm':'Nights',b.nights)+field(vi?'Hạng phòng':'Room',b.roomName)+field(vi?'Người lớn / Trẻ em / Phòng':'Adults / Children / Rooms',[b.adults,b.children,b.rooms].map(function(x){return x==null?'—':x;}).join(' / '))+'</dl>'+
        (b.specialRequests?'<p class="muted">'+(vi?'Yêu cầu đặc biệt: ':'Special requests: ')+e(b.specialRequests)+'</p>':''))+
      section(vi?'Khách đại diện':'Lead guest','<dl class="dl">'+field(vi?'Họ tên':'Name',b.guest && b.guest.fullName)+field('Email',b.guest && b.guest.email)+'</dl>')+
      section(vi?'Chi tiết giá':'Price',price)+
      (g==='processing'||g==='upcoming'?section(vi?'Chính sách hủy':'Cancellation',
        '<p class="muted">'+(vi?'Điều kiện, thời hạn hủy miễn phí và phí hủy (nếu có) được hiển thị khi bạn bấm "Hủy đặt phòng", trước khi xác nhận. Gửi yêu cầu hủy chưa đồng nghĩa đặt phòng đã bị hủy.':'The free-cancellation window and any fee are shown when you press "Cancel booking", before you confirm. Requesting cancellation does not by itself cancel the booking.')+'</p>'):'')+
      '<div id="mbActions" class="actions"></div><div class="actions mykas-detail__links">'+hotelLink+supportLink+'</div></div>';
  }
  global.KAS_REQUEST_VIEW={state:state,group:group,payment:payment,endedReason:endedReason,map:map,timeline:timeline,details:details,money:money};
})(window);
