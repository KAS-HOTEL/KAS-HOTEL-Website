'use strict';
(function(){
  var key='', data=null;
  var status=document.getElementById('status'), management=document.getElementById('management');
  var collectionGrid=document.getElementById('collectionGrid'), propertyGrid=document.getElementById('propertyGrid'), rooms=document.getElementById('rooms'), photoRooms=document.getElementById('photoRooms');
  function esc(s){return String(s==null?'':s).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});}
  function money(v){return new Intl.NumberFormat('vi-VN').format(+v||0)+' ₫';}
  function setStatus(t,ok){status.className='status '+(ok?'ok':'err');status.textContent=t;}
  function toast(t){var el=document.getElementById('toast');el.textContent=t;el.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(function(){el.style.display='none';},2400);}
  function api(url,opts){opts=opts||{};opts.headers=Object.assign({'x-admin-key':key},opts.headers||{});return fetch(url,opts).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||'Có lỗi.');return x;});});}
  function roomRows(){var arr=[];(data.branches||[]).forEach(function(b){(b.rooms||[]).forEach(function(r){arr.push({branch:b,room:r});});});return arr;}
  function renderCollections(){
    collectionGrid.innerHTML=(data.branches||[]).map(function(b){
      var img=(data.collectionImages||{})[b.hotelId];
      var fallback='';
      return '<article class="collectionCard"><div class="media">'+(img?'<img src="'+esc(img)+'" alt="">':'<div class="small">Chưa có ảnh Collection riêng</div>')+'</div><div class="body"><h3>'+esc('Chi nhánh '+b.address)+'</h3><div class="small">'+esc(b.hotelId)+'</div><div class="rowActions"><input type="file" accept="image/jpeg,image/png,image/webp" data-collection-input="'+esc(b.hotelId)+'"><button class="btn gold" data-collection-upload="'+esc(b.hotelId)+'">Thay ảnh</button>'+(img?'<button class="btn danger" data-collection-delete="'+esc(b.hotelId)+'">Xóa</button>':'')+'</div></div></article>';
    }).join('');
    collectionGrid.querySelectorAll('[data-collection-upload]').forEach(function(btn){btn.addEventListener('click',function(){
      var id=btn.dataset.collectionUpload, input=collectionGrid.querySelector('[data-collection-input="'+CSS.escape(id)+'"]');
      if(!input || !input.files.length){toast('Hãy chọn ảnh Collection trước.');return;}
      var fd=new FormData();fd.append('hotelId',id);fd.append('image',input.files[0]);btn.disabled=true;
      api('/api/admin/collection-image',{method:'POST',body:fd}).then(function(){toast('Đã đổi ảnh Collection cho '+id);return load();}).catch(function(e){setStatus(e.message,false);}).finally(function(){btn.disabled=false;});
    });});
    collectionGrid.querySelectorAll('[data-collection-delete]').forEach(function(btn){btn.addEventListener('click',function(){
      var id=btn.dataset.collectionDelete;if(!confirm('Xóa ảnh Collection riêng của '+id+' và quay về ảnh mặc định?'))return;
      api('/api/admin/collection-image/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){toast('Đã xóa ảnh Collection.');return load();}).catch(function(e){setStatus(e.message,false);});
    });});
  }
  function renderPropertyGallery(){
    if(!propertyGrid) return;
    propertyGrid.innerHTML=(data.branches||[]).map(function(b){
      var imgs=b.propertyImages||[];
      var thumbs=imgs.map(function(x){
        return '<div class="thumb"><img src="'+esc(x.url||x)+'" alt=""><div><span title="'+esc(x.name||'')+'">'+esc((x.name||'').slice(0,16))+'</span><button class="btn danger" style="padding:5px 7px;font-size:10px" data-property-delete="'+esc(x.id||'')+'">Xóa</button></div></div>';
      }).join('');
      return '<article class="collectionCard"><div class="media">'+
        (imgs.length?'<img src="'+esc(imgs[0].url||imgs[0])+'" alt="">':'<div class="small">Chưa có gallery riêng</div>')+
        '</div><div class="body"><h3>'+esc(b.address)+'</h3><div class="small">'+esc(b.hotelId)+' · '+imgs.length+' ảnh bên trong</div>'+
        '<div class="upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-property-input="'+esc(b.hotelId)+'"><button class="btn gold" data-property-upload="'+esc(b.hotelId)+'">Thêm ảnh</button></div>'+
        '<div class="thumbs">'+thumbs+'</div></div></article>';
    }).join('');
    propertyGrid.querySelectorAll('[data-property-upload]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var id=btn.dataset.propertyUpload, input=propertyGrid.querySelector('[data-property-input="'+CSS.escape(id)+'"]');
        if(!input || !input.files.length){toast('Hãy chọn ảnh bên trong khách sạn trước.');return;}
        if(input.files.length>20){toast('Mỗi lần tối đa 20 ảnh.');return;}
        var fd=new FormData();fd.append('hotelId',id);
        Array.prototype.forEach.call(input.files,function(f){fd.append('images',f);});
        btn.disabled=true;
        api('/api/admin/property-images',{method:'POST',body:fd}).then(function(x){toast('Đã thêm '+x.added+' ảnh cho '+id);return load();}).catch(function(e){setStatus(e.message,false);}).finally(function(){btn.disabled=false;});
      });
    });
    propertyGrid.querySelectorAll('[data-property-delete]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!btn.dataset.propertyDelete)return;
        if(!confirm('Xóa ảnh này khỏi gallery khách sạn?'))return;
        api('/api/admin/property-images/'+encodeURIComponent(btn.dataset.propertyDelete),{method:'DELETE'}).then(function(){toast('Đã xóa ảnh gallery.');return load();}).catch(function(e){setStatus(e.message,false);});
      });
    });
  }

  function priceInput(key,season,idx,val,label){return '<label>'+label+'<input type="number" min="0" step="50000" data-rate="'+esc(key)+'" data-season="'+season+'" data-idx="'+idx+'" value="'+esc(val)+'"></label>';}
  function renderRooms(filter){
    var q=(filter||'').trim().toLowerCase();
    var arr=roomRows().filter(function(x){var b=x.branch,r=x.room;return !q || [b.address,b.hotelId,r.stt,r.ez,r.name].join(' ').toLowerCase().indexOf(q)>-1;});
    rooms.innerHTML=arr.map(function(x){var b=x.branch,r=x.room;return '<article class="room"><div class="roomHead"><div><h3>'+esc('Chi nhánh '+b.address)+' · STT '+r.stt+' · '+esc(r.name)+'</h3><div class="meta">Ez: '+esc(r.ez)+' · Mã room: '+esc(r.key)+'</div></div><div class="galleryCount">'+money(r.rates.jul_sep[0])+' / '+money(r.rates.jul_sep[1])+' · Jul–Sep</div></div><div class="priceGrid">'+seasonBox(r,'jul_sep','Tháng 7–9')+seasonBox(r,'oct','Tháng 10')+seasonBox(r,'nov_jan','Tháng 11–1/2027')+'</div><div class="saveRow"><button class="btn gold" data-save-rate="'+esc(r.key)+'">Lưu giá hạng phòng này</button></div></article>';}).join('');
    rooms.querySelectorAll('[data-save-rate]').forEach(function(btn){btn.addEventListener('click',function(){saveRates(btn.dataset.saveRate,btn);});});
  }
  function seasonBox(r,season,title){var p=r.rates[season];return '<div class="seasonBox"><div class="seasonTitle">'+title+'</div><div class="priceInputs">'+priceInput(r.key,season,0,p[0],'Trong tuần')+priceInput(r.key,season,1,p[1],'Cuối tuần (T6–CN)')+'</div></div>';}
  function saveRates(keyRoom,btn){
    var rates={};['jul_sep','oct','nov_jan'].forEach(function(s){rates[s]=[0,1].map(function(i){var el=document.querySelector('[data-rate="'+CSS.escape(keyRoom)+'"][data-season="'+s+'"][data-idx="'+i+'"]');return Number(el.value||0);});});
    btn.disabled=true;api('/api/admin/room-rates',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomKey:keyRoom,rates:rates})}).then(function(){toast('Đã lưu giá cho '+keyRoom);return load();}).catch(function(e){setStatus(e.message,false);}).finally(function(){btn.disabled=false;});
  }
  function renderPhotos(){
    photoRooms.innerHTML=(data.branches||[]).map(function(b){
      return '<section class="room"><div class="roomHead"><div><h3>'+esc('Chi nhánh '+b.address)+'</h3><div class="meta">'+b.rooms.length+' hạng phòng</div></div></div>'+b.rooms.map(function(r){var imgs=r.images||[];return '<div style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px"><div class="roomHead"><div><b>'+esc('STT '+r.stt+' · '+r.name)+'</b><div class="meta">Ez: '+esc(r.ez)+'</div></div><span class="galleryCount">'+imgs.length+' ảnh</span></div><div class="upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-room="'+esc(r.key)+'"><button class="btn gold" data-upload="'+esc(r.key)+'">Upload ảnh</button></div><div class="thumbs">'+imgs.map(function(x){return '<div class="thumb"><img src="'+esc(x.url)+'" alt=""><div><span title="'+esc(x.name)+'">'+esc((x.name||'').slice(0,16))+'</span><button class="btn danger" style="padding:5px 7px;font-size:10px" data-delete="'+esc(x.id)+'">Xóa</button></div></div>';}).join('')+'</div></div>';}).join('')+'</section>';
    }).join('');
    photoRooms.querySelectorAll('[data-upload]').forEach(function(btn){btn.addEventListener('click',function(){var keyRoom=btn.dataset.upload;var input=photoRooms.querySelector('input[data-room="'+CSS.escape(keyRoom)+'"]');if(!input.files.length){toast('Hãy chọn ảnh phòng.');return;}var fd=new FormData();fd.append('roomKey',keyRoom);Array.prototype.forEach.call(input.files,function(f){fd.append('images',f);});btn.disabled=true;api('/api/admin/upload',{method:'POST',body:fd}).then(function(x){toast('Đã upload '+x.added+' ảnh.');return load();}).catch(function(e){setStatus(e.message,false);}).finally(function(){btn.disabled=false;});});});
    photoRooms.querySelectorAll('[data-delete]').forEach(function(btn){btn.addEventListener('click',function(){if(!confirm('Xóa ảnh này?'))return;api('/api/admin/upload/'+encodeURIComponent(btn.dataset.delete),{method:'DELETE'}).then(function(){toast('Đã xóa ảnh.');return load();}).catch(function(e){setStatus(e.message,false);});});});
  }
  function render(){renderCollections();renderPropertyGallery();renderRooms(document.getElementById('roomSearch').value);renderPhotos();}
  function load(){return fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.json();}).then(function(x){data=x;render();});}
  document.getElementById('roomSearch').addEventListener('input',function(){renderRooms(this.value);});
  document.getElementById('login').addEventListener('click',function(){key=document.getElementById('key').value.trim();if(!key){setStatus('Hãy nhập ADMIN_KEY.',false);return;}api('/api/admin/status').then(function(){setStatus('Đã mở quyền quản trị.',true);management.classList.remove('hidden');document.getElementById('publicBox').classList.remove('hidden');document.getElementById('publicUrl').textContent=location.origin+'/index.html';document.getElementById('referenceUrl').textContent=location.origin+'/reference';return load();}).catch(function(e){setStatus(e.message,false);});});
})();
