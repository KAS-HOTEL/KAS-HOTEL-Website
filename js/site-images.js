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
    setImg('home.dayInSaigon','img[alt="A day in Saigon"]');
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
    document.querySelectorAll('.cg-card[href*="city-guidebook"]').forEach(function(card){
      var href=card.getAttribute('href')||'', hash=href.split('#')[1];
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
  function load(){
    fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(c){
      if(!c) return;
      var site=c.siteImages||{};
      applyPageHeroes(site);
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
