'use strict';
(function(){
  var homeHero=document.querySelector('#homeHeroBg');
  if(homeHero) homeHero.classList.add('site-image-pending');

  function applyHome(site){
    site=site||{};
    function setImg(key, selector){
      var item=site[key], el=document.querySelector(selector);
      if(item&&item.url&&el&&el.tagName==='IMG') el.src=item.url;
    }
    setImg('home.dayInSaigon','img[data-site-image="home.dayInSaigon"], img[alt="A day in Saigon"]');
    /* Homepage V3 City Guide feature: one image, keyed like the first story card. */
    setImg('home.neighborhood.city','img[data-site-image="home.neighborhood.city"]');
    /* Keep the four homepage story cards tied to their stable Admin keys.
       Match the actual anchor URL rather than relying on a brittle CSS selector. */
    ['city','taste','slow','night'].forEach(function(k){
      var item=site['home.neighborhood.'+k];
      var card=Array.prototype.find.call(document.querySelectorAll('.home-neighborhoods__card'),function(el){
        try { return new URL(el.getAttribute('href'),location.href).hash==='#'+k; } catch (_) { return false; }
      });
      var img=card&&card.querySelector('img');
      if(item&&item.url&&img&&img.getAttribute('src')!==item.url) img.setAttribute('src',item.url);
    });
    /* Home Hero is exactly 12 slides: 8 KAS properties + 4 Vietnam destinations.
       First 8 use dedicated admin keys; slides 9-12 retain the legacy heroExtra
       keys so existing overrides remain compatible. */
    /* Apply every configured Home Hero slot by its Admin key.
       The hero slides are created dynamically by the inline home script, so
       this is intentionally selector-based and does not depend on a fixed
       render delay. */
    var heroLoads=[];
    for(var i=0;i<12;i++){
      var key = i<8 ? 'home.hero.0'+(i+1) : 'home.heroExtra'+(i-7);
      var heroItem=site[key];
      var heroEl=document.querySelector('.home-hero__slide[data-index="'+i+'"] img');
      if(!heroItem||!heroItem.url||!heroEl) continue;
      if(i===0 && heroEl.src!==heroItem.url){
        (function(el,url){
          heroLoads.push(new Promise(function(resolve){
            var img=new Image();
            img.onload=function(){ el.src=url; resolve(); };
            img.onerror=function(){ resolve(); };
            img.src=url;
          }));
        })(heroEl,heroItem.url);
      } else if(heroEl.src!==heroItem.url){
        heroEl.src=heroItem.url;
      }
    }
    return Promise.all(heroLoads);
  }
  function applyFindYourKas(site){
    site=site||{};
    var main=site['find.zero.main'], card=site['find.zero.card'];
    var mainEl=document.querySelector('.find-page-hero-main');
    var cardEl=document.querySelector('.find-page-hero-card');
    if(main&&main.url&&mainEl) mainEl.style.backgroundImage="url('"+String(main.url).replace(/'/g,"%27")+"')";
    if(card&&card.url&&cardEl) cardEl.style.backgroundImage="url('"+String(card.url).replace(/'/g,"%27")+"')";
  }
  function applyGuidebook(site){
    site=site||{};
    var hero=site['guidebook.hero'], visual=document.querySelector('.hero-visual');
    if(hero&&hero.url&&visual) visual.style.backgroundImage="url('"+String(hero.url).replace(/'/g,"%27")+"')";
    Object.keys(site).forEach(function(key){
      if(key.indexOf('guidebook.entry.')!==0) return;
      var id=key.slice('guidebook.entry.'.length), item=site[key], el=document.querySelector('.entry#'+CSS.escape(id)+' .photo');
      if(item&&item.url&&el) el.style.backgroundImage="url('"+String(item.url).replace(/'/g,"%27")+"')";
    });
  }
  function applyCityGuide(site){
    site=site||{};
    /* Cards point at the story page (data-story) or, before the editorial
       script runs, at the guidebook anchor; both name the same entry. */
    document.querySelectorAll('.cg-card[data-story], .cg-card[href*="city-guidebook"]').forEach(function(card){
      var href=card.getAttribute('href')||'', hash=card.getAttribute('data-story')||href.split('#')[1];
      if(!hash) return;
      var item=site['guidebook.entry.'+hash];
      if(item&&item.url) card.style.setProperty('--cg-bg',"url('"+String(item.url).replace(/'/g,"%27")+"')");
    });
  }
  function applyPageHeroes(site){
    var welcome=document.querySelector('.kas-welcome__visual img');
    if(welcome&&site['page.hero.welcome']&&site['page.hero.welcome'].url) welcome.src=site['page.hero.welcome'].url;
    var targets={
      'page.hero.experiences':document.querySelector('.content-page-hero'),
      'page.hero.offers':document.querySelector('.content-page-hero'),
      'page.hero.my-kas':document.querySelector('.hero--mykas-intro'),
      'page.hero.about':document.querySelector('.content-page-hero'),
      'page.hero.support':document.querySelector('.content-page-hero'),
      'page.hero.hotels':document.querySelector('#heroBg')
    };
    var pageKey=location.pathname.split('/').pop().replace(/\.html$/,'');
    var keyByPage={'experiences':'page.hero.experiences','offers':'page.hero.offers','manage-booking':'page.hero.my-kas','about':'page.hero.about','support':'page.hero.support','hotels':'page.hero.hotels'};
    var key=keyByPage[pageKey], item=key&&site[key], el=key&&targets[key];
    if(item&&item.url&&el){
      var adminUrl=String(item.url).replace(/'/g,'%27');
      if(key==='page.hero.hotels'){
        /* Hotels has one image layer only. Replace the legacy hotel-02 image
           with the Admin-managed Hero and never stack two sources. */
        el.innerHTML='';
        var heroImg=new Image();
        heroImg.alt='KAS Hotels Hero';
        heroImg.onload=function(){ el.innerHTML=''; el.appendChild(heroImg); };
        heroImg.onerror=function(){ el.innerHTML=''; };
        heroImg.src=adminUrl;
      } else {
        /* One source only: clear any legacy inline/background layer before
           assigning the current Admin-managed hero image. */
        el.style.backgroundImage='none';
        if(key==='page.hero.my-kas'){
          el.style.backgroundImage="url('"+adminUrl+"')";
        } else {
          el.style.backgroundImage="linear-gradient(rgba(14,13,11,.42),rgba(14,13,11,.42)),url('"+adminUrl+"')";
        }
        el.style.backgroundSize='cover';
        el.style.backgroundPosition='center';
      }
    } else if(key==='page.hero.hotels'&&el){
      /* No Admin override yet: keep the existing hotel-02 image as the
         single fallback source, not an additional overlay layer. */
      var fallbackHotel=window.KAS_DATA&&window.KAS_DATA.getHotel?window.KAS_DATA.getHotel('hotel-02'):null;
      var fallbackSrc=fallbackHotel&&fallbackHotel.images&&fallbackHotel.images[0];
      el.innerHTML=fallbackSrc?'<img src="'+String(fallbackSrc).replace(/"/g,'&quot;')+'" alt="'+String((fallbackHotel&&fallbackHotel.name)||'KAS Hotels').replace(/"/g,'&quot;')+'">':'';
    }
  }
  /* Site images are managed in the console (/admin/content/images). Its slots win over the
     old admin's JSON; a slot switched off in the console falls back to the page default.
     Keys the console does not have yet keep the old value. */
  function consoleSlots(){
    return fetch('/api/v1/public/site-image-slots',{cache:'no-store',credentials:'omit'})
      .then(function(r){return r.ok?r.json():[];}).catch(function(){return [];});
  }
  function load(){
    Promise.all([
      fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      consoleSlots()
    ]).then(function(results){
      var c=results[0]||{}, slots=Array.isArray(results[1])?results[1]:[];
      if(!results[0]&&!slots.length) return;
      var site=Object.assign({}, c.siteImages||{});
      slots.forEach(function(slot){
        if(!slot||!slot.key) return;
        if(slot.enabled===false){ delete site[slot.key]; return; }
        if(slot.imageReference) site[slot.key]={url:slot.imageReference};
      });
      applyPageHeroes(site);
      if(document.querySelector('.kas-find-page')) applyFindYourKas(site);
      var homeHero=document.querySelector('#homeHeroBg');
      if(homeHero){
        applyHome(site).then(function(){
          homeHero.classList.remove('site-image-pending');
        });
        /* Keep Admin → Website sync reliable even if the hero is rebuilt
           after the API response arrives. */
        if(!homeHero.__kasSiteImageObserver){
          var observer=new MutationObserver(function(){applyHome(site);});
          observer.observe(homeHero,{childList:true,subtree:true});
          homeHero.__kasSiteImageObserver=true;
        }
      } else if(location.pathname.endsWith('/index.html') || location.pathname==='/' ){
        applyHome(site);
      }
      if(document.querySelector('.guide-nav-wrap')||document.querySelector('.entry-grid')) applyGuidebook(site);
      if(document.querySelector('.cg-card')) applyCityGuide(site);
    }).catch(function(){
      if(homeHero) homeHero.classList.remove('site-image-pending');
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load); else load();
  window.addEventListener('pageshow',function(){ if(document.visibilityState==='visible') load(); });
})();
