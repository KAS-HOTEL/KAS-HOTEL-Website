'use strict';
(function(){
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
    for(var i=0;i<12;i++){
      var key = i<8 ? 'home.hero.0'+(i+1) : 'home.heroExtra'+(i-7);
      var heroItem=site[key];
      var heroEl=document.querySelector('.home-hero__slide[data-index="'+i+'"] img');
      if(heroItem&&heroItem.url&&heroEl&&heroEl.src!==heroItem.url) heroEl.src=heroItem.url;
    }
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
    var targets={
      'page.hero.experiences':document.querySelector('.content-page-hero'),
      'page.hero.offers':document.querySelector('.content-page-hero'),
      'page.hero.my-kas':document.querySelector('.hero--mykas-intro'),
      'page.hero.about':document.querySelector('.content-page-hero'),
      'page.hero.support':document.querySelector('.content-page-hero')
    };
    var pageKey=location.pathname.split('/').pop().replace(/\.html$/,'');
    var keyByPage={'experiences':'page.hero.experiences','offers':'page.hero.offers','manage-booking':'page.hero.my-kas','about':'page.hero.about','support':'page.hero.support'};
    var key=keyByPage[pageKey], item=key&&site[key], el=key&&targets[key];
    if(item&&item.url&&el){el.style.backgroundImage="linear-gradient(rgba(14,13,11,.42),rgba(14,13,11,.42)),url('"+String(item.url).replace(/'/g,'%27')+"')";el.style.backgroundSize='cover';el.style.backgroundPosition='center';}
  }
  function load(){
    fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(c){
      if(!c) return;
      var site=c.siteImages||{};
      applyPageHeroes(site);
      var homeHero=document.querySelector('#homeHeroBg');
      if(homeHero){
        applyHome(site);
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
    }).catch(function(){});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load); else load();
  window.addEventListener('pageshow',function(){ if(document.visibilityState==='visible') load(); });
})();
