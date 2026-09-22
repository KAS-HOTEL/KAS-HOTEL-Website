'use strict';
(function(){
  var data=null;
  var ci=document.getElementById('checkIn'), co=document.getElementById('checkOut'), br=document.getElementById('branch'), content=document.getElementById('content');
  var today=new Date();
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  var defaultIn=iso(today), next=new Date(today); next.setDate(next.getDate()+1); var defaultOut=iso(next);
  ci.value=defaultIn; co.value=defaultOut;
  function money(v){return v==null?'—':new Intl.NumberFormat('vi-VN').format(v)+' ₫';}
  function weekend(isoDate){var p=isoDate.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]).getDay();return d===5||d===6||d===0;}
  function season(isoDate){for(var i=0;i<data.seasons.length;i++){var s=data.seasons[i];if(isoDate>=s.from&&isoDate<=s.to)return s.key;}return null;}
  function nights(a,b){var out=[];var p=a.split('-'),q=b.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]),end=new Date(+q[0],+q[1]-1,+q[2]);while(d<end){out.push(iso(d));d.setDate(d.getDate()+1);}return out;}
  function rate(room,date){var s=season(date);if(!s)return null;var pair=room.rates[s];if(!pair)return null;return pair[weekend(date)?1:0];}
  function esc(s){return String(s==null?'':s).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});}
  function render(){
    if(!data)return;
    var a=ci.value,b=co.value;if(!a||!b||b<=a){content.innerHTML='<div class="empty">Vui lòng chọn ngày trả phòng sau ngày nhận phòng.</div>';return;}
    var selected=br.value, ns=nights(a,b);
    var html='';
    data.branches.filter(function(x){return !selected||x.hotelId===selected;}).forEach(function(branch){
      html+='<section class="branch"><div class="branchHead"><div><h2>Chi nhánh '+esc(branch.address)+'</h2><small>'+branch.rooms.length+' hạng phòng · Giá theo bảng giá KAS</small></div></div><div class="rooms">';
      branch.rooms.forEach(function(room){
        var vals=ns.map(function(d){return rate(room,d);}), total=vals.every(function(v){return v!=null;})?vals.reduce(function(s,v){return s+v;},0):null;
        var first=room.images[0];
        html+='<article class="room"><div class="gallery">'+(first?'<img loading="lazy" src="'+esc(first.url)+'" alt="'+esc(room.name)+'"><span class="galleryCount">'+room.images.length+' ảnh</span>':'<div class="noimg">Chưa upload ảnh cho hạng phòng này.<br>Vui lòng dùng trang quản trị để thêm ảnh.</div>')+'</div><div class="roomBody"><div class="roomTitle"><h3>'+esc(room.name)+'</h3><span class="ez">Ez: '+esc(room.ez)+'</span></div><div class="meta">STT '+room.stt+' · '+esc(branch.address)+'</div><div class="priceBox"><div class="price">'+(total==null?'Không có đủ giá cho khoảng ngày này':money(total))+'</div><div class="sub">'+ns.length+' đêm · '+a+' → '+b+' · chỉ tham khảo</div><div class="breakdown">'+ns.map(function(d,i){return '<span class="night '+(weekend(d)?'wknd':'')+'"><b>'+d+'</b> · '+(weekend(d)?'Cuối tuần':'Trong tuần')+' · '+money(vals[i])+'</span>';}).join('')+'</div></div><div class="source">Giá nguồn: bảng giá phòng KAS · Không bao gồm ăn sáng.</div>'+'</div></article>';
      });
      html+='</div></section>';
    });
    if(!html)html='<div class="empty">Không có chi nhánh phù hợp.</div>';
    content.innerHTML=html;
  }
  Promise.all([fetch('data/rate-sheet.json').then(function(r){return r.json();}),fetch('api/catalog').then(function(r){return r.json();})]).then(function(res){
    data=res[1]; data.seasons=res[0].seasons||data.seasons; data.policy=res[0].policy||data.policy;
    data.branches.forEach(function(b){var o=document.createElement('option');o.value=b.hotelId;o.textContent=b.address;br.appendChild(o);});render();
  }).catch(function(e){content.innerHTML='<div class="empty">Không tải được dữ liệu. Hãy chạy website bằng <b>npm run server</b> thay vì mở file HTML trực tiếp.</div>';console.error(e);});
  [ci,co,br].forEach(function(el){el.addEventListener('change',function(){if(ci.value>=co.value){var d=new Date(ci.value+'T00:00:00');d.setDate(d.getDate()+1);co.value=iso(d);}render();});});
})();
