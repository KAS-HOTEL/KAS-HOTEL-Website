/* ==========================================================================
   KAS — APP SHELL  (header, footer, drawer, gallery, scroll FX)
   ========================================================================== */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA;

  /* ---------------- logo ---------------- */
  function logoMark(color) {
    return '<svg class="logo__mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">' +
      '<path d="M20 2.5l15.5 9v17L20 37.5 4.5 28.5v-17L20 2.5z" stroke="' + color + '" stroke-width="1.1"/>' +
      '<path d="M20 8l10 5.8v11.4L20 31l-10-5.8V13.8L20 8z" stroke="' + color + '" stroke-width=".8" opacity=".55"/>' +
      '<path d="M16 14v12M16 20l7-6M16 20l7 6" stroke="' + color + '" stroke-width="1.3" stroke-linecap="round"/>' +
      '</svg>';
  }
  function logo(dark, href) {
    return '<a class="logo" href="' + (href || 'index.html') + '" aria-label="KAS Hotel Collection — home">' +
      '<img src="assets/logo/kas-hotel-collection.svg" alt="KAS Hotel Collection" style="width:180px;max-width:42vw;height:auto;display:block">' +
      '</a>';
  }

  var NAV = [
    { t: 'Hotels',       h: 'hotels.html' },
    { t: 'Experiences',  h: 'experiences.html' },
    { t: 'Offers',       h: 'offers.html' },
    { t: 'My KAS',       h: 'manage-booking.html' },
    { t: 'About KAS',    h: 'about.html' },
    { t: 'Support',      h: 'support.html' }
  ];

  /* ---------------- header ---------------- */
  function flagIcon(lang) {
    if (lang === 'vi') {
      return '<svg class="lang-flag-svg" viewBox="0 0 28 18" aria-hidden="true"><rect width="28" height="18" rx="2" fill="#da251d"/><path d="M14 3.1l1.35 4.05h4.28l-3.46 2.5 1.32 4.08L14 11.25l-3.49 2.48 1.32-4.08-3.46-2.5h4.28L14 3.1z" fill="#ffdf00"/></svg>';
    }
    return '<svg class="lang-flag-svg" viewBox="0 0 28 18" aria-hidden="true"><rect width="28" height="18" rx="2" fill="#012169"/><path d="M0 0l28 18M28 0L0 18" stroke="#fff" stroke-width="4"/><path d="M0 0l28 18M28 0L0 18" stroke="#c8102e" stroke-width="1.7"/><path d="M14 0v18M0 9h28" stroke="#fff" stroke-width="6"/><path d="M14 0v18M0 9h28" stroke="#c8102e" stroke-width="3"/></svg>';
  }

  function renderHeader(opts) {
    opts = opts || {};
    var host = U.$('#hdr'); if (!host) return;
    var active = opts.active || '';
    /* Remove any previous scroll binding before re-rendering the header. */
    if (host.__kasScrollHandler) {
      window.removeEventListener('scroll', host.__kasScrollHandler);
      host.__kasScrollHandler = null;
    }
    host.className = 'hdr' + (opts.floating ? ' hdr--float header--transparent' : '');
    host.innerHTML =
      '<div class="container hdr__in">' +
        logo(true) +
        '<nav class="nav" aria-label="Main">' +
          NAV.map(function (n) {
            return '<a href="' + n.h + '"' + (n.t.toLowerCase() === active ? ' class="is-active"' : '') + '>' + n.t + '</a>';
          }).join('') +
        '</nav>' +
        '<div class="hdr__right">' +
          global.Contact.headerBlock() +
          '<div class="lang-wrap lang-wrap--custom" title="Language">' +
            '<span class="sr">Language</span>' +
            '<select class="lang-select" aria-label="Language"><option value="en">EN</option><option value="vi">VI</option></select>' +
            '<button class="lang-button" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="lang-current-flag" aria-hidden="true">' + flagIcon('en') + '</span><span class="lang-current-code">EN</span><span class="lang-chevron" aria-hidden="true">⌄</span></button>' +
            '<div class="lang-menu" role="listbox" aria-label="Language">' +
              '<button type="button" class="lang-option" data-lang="vi" role="option"><span class="lang-option-flag" aria-hidden="true">' + flagIcon('vi') + '</span><span>VI</span></button>' +
              '<button type="button" class="lang-option" data-lang="en" role="option"><span class="lang-option-flag" aria-hidden="true">' + flagIcon('en') + '</span><span>ENG</span></button>' +
            '</div>' +
          '</div>' +
          '<button class="btn btn--gold btn--sm js-kas-auth" type="button">Sign in / Join</button>' +
          '<button class="burger" type="button" aria-label="Open menu">' + U.icon('menu', 22) + '</button>' +
        '</div>' +
      '</div>';

    U.$('.burger', host).addEventListener('click', openDrawer);

    /* Custom language picker: keeps the EN/VI control visually consistent and
       adds country flags while the native select remains the i18n bridge. */
    (function bindLangPicker(){
      var wrap = U.$('.lang-wrap--custom', host), btn = U.$('.lang-button', wrap), menu = U.$('.lang-menu', wrap);
      if (!wrap || !btn || !menu) return;
      function close(){ wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); }
      btn.addEventListener('click', function(e){ e.stopPropagation(); var open = wrap.classList.toggle('is-open'); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); });
      U.$$('.lang-option', menu).forEach(function(opt){
        opt.addEventListener('click', function(){
          var select = U.$('.lang-select', wrap), lang = opt.getAttribute('data-lang');
          if (!select) return;
          select.value = lang;
          select.dispatchEvent(new Event('change', {bubbles:true}));
          close();
        });
      });
      if (host.__kasLangClose) document.removeEventListener('click', host.__kasLangClose);
      host.__kasLangClose = close;
      document.addEventListener('click', close);
    }());

    if (opts.floating) {
      var onScroll = function () {
        /* Homepage: transparent only at the very top.
           As soon as the page moves away from scroll=0, switch smoothly
           to the solid black navigation. */
        var scrolled = window.scrollY > 8;
        host.classList.toggle('header--transparent', !scrolled);
        host.classList.toggle('header--scrolled', scrolled);
        /* Backward-compatible state class for existing styles. */
        host.classList.toggle('hdr--solid', scrolled);
      };
      if (host.__kasScrollHandler) window.removeEventListener('scroll', host.__kasScrollHandler);
      host.__kasScrollHandler = onScroll;
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    buildDrawer(active);
  }

  function buildDrawer(active) {
    if (U.$('#drawer')) return;
    var d = U.el('div', { id: 'drawer', class: 'drawer' });
    d.innerHTML =
      '<div class="drawer__hd">' + logo(true) +
        '<button type="button" aria-label="Close menu">' + U.icon('x', 22) + '</button></div>' +
      '<nav>' + NAV.map(function (n) {
        return '<a href="' + n.h + '"' + (n.t.toLowerCase() === active ? ' class="is-active"' : '') + '>' +
          n.t + U.icon('chevR', 14) + '</a>';
      }).join('') + '</nav>' +
      '<div class="drawer__ft">' +
        '<a class="btn btn--gold btn--block" href="hotels.html">Find your stay</a>' +
        '<a class="btn btn--ghost-lt btn--block" href="manage-booking.html">Manage booking</a>' +
        '<div style="display:flex;flex-direction:column;gap:4px;margin-top:10px;align-items:center">' +
          global.Contact.phoneLink('inverse') +
          global.Contact.zaloLink('inverse') +
          global.Contact.whatsappLink('inverse') +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
    U.$('.drawer__hd button', d).addEventListener('click', closeDrawer);
    d.addEventListener('click', function (e) { if (e.target === d) closeDrawer(); });
  }
  function openDrawer() { var d = U.$('#drawer'); if (d) { d.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function closeDrawer() { var d = U.$('#drawer'); if (d) { d.classList.remove('open'); document.body.style.overflow = ''; } }

  /* ---------------- footer ---------------- */
  var FOOT_COLS = [
    { h: 'Hotels',       l: [['KAS Passion Boutique','hotel-detail.html?hotel=hotel-01'],['KAS Elegance','hotel-detail.html?hotel=hotel-02'],['KAS Ancient Boutique','hotel-detail.html?hotel=hotel-03'],['KAS Milestone Premium','hotel-detail.html?hotel=hotel-04'],['KAS Zody Boutique','hotel-detail.html?hotel=hotel-05'],['KAS Sonata Luxury','hotel-detail.html?hotel=hotel-06'],['KAS Eliana Luxury','hotel-detail.html?hotel=hotel-07'],['KAS Dilly Luxury','hotel-detail.html?hotel=hotel-08']] },
    { h: 'Experiences',  l: [['Dining','experiences.html#dining'],['Rooftop bars','experiences.html#rooftops'],['Wellness & spa','experiences.html#wellness'],['Local experiences','experiences.html#local'],['Airport transfer','experiences.html#transfer']] },
    { h: 'Support',      l: [['FAQ','support.html#faq'],['Booking information','support.html#booking'],['Cancellation policy','support.html#cancellation'],['Payment methods','support.html#payment'],['Contact us','support.html#contact']] },
    { h: 'My KAS',       l: [['My bookings','manage-booking.html'],['Manage booking','manage-booking.html'],['Member benefits','offers.html#member'],['Sign in / Join','manage-booking.html']] },
    { h: '__CONTACT__',  l: [] },
    { h: '__TRADE__',    l: [] }
  ];

  function renderFooter() {
    var host = U.$('#ftr'); if (!host) return;
    var CT = D.config.contact || {};
    /* Names follow KAS_DATA; each of the 8 properties appears exactly once. */
    var footerLinks = [
      ['KAS Milestone','hotel-detail.html?hotel=hotel-04'],
      ['KAS Ancient','hotel-detail.html?hotel=hotel-03'],
      ['KAS Premium','hotel-detail.html?hotel=hotel-02'],
      ['KAS Sonata','hotel-detail.html?hotel=hotel-06']
    ];
    var moreLinks = [
      ['KAS Eliana','hotel-detail.html?hotel=hotel-07'],
      ['KAS Passion','hotel-detail.html?hotel=hotel-01'],
      ['KAS Dilly','hotel-detail.html?hotel=hotel-08'],
      ['KAS Zody','hotel-detail.html?hotel=hotel-05']
    ];
    host.className = 'ftr ftr--dark';
    host.innerHTML =
      '<div class="container">' +
        '<div class="ftr__main">' +
          '<div class="ftr__brand">' + logo(false) +
            '<p>Distinctive stays in the heart of Ho Chi Minh City, created with thoughtful service and memorable experiences.</p>' +
            '<div class="social">' +
              ['ig','fb','phone'].map(function (s) {
                var label = { ig: 'Instagram', fb: 'Facebook', phone: 'Call KAS' }[s];
                if (s === 'phone') return '<a href="' + CT.tel + '" aria-label="' + label + '">' + U.icon(s, 15) + '</a>';
                return '<a href="#" aria-label="' + label + '" onclick="return false">' + U.icon(s, 15) + '</a>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="ftr__col"><h5>KAS Hotels</h5>' +
            footerLinks.map(function(x){return '<a href="'+x[1]+'">'+x[0]+'</a>';}).join('') +
          '</div>' +
          '<div class="ftr__col"><h5>More KAS Hotels</h5>' +
            moreLinks.map(function(x){return '<a href="'+x[1]+'">'+x[0]+'</a>';}).join('') +
          '</div>' +
          '<div class="ftr__col"><h5>Discover</h5>' +
            '<a href="about.html">About KAS</a><a href="city-guide.html">City Guide</a><a href="experiences.html">Experiences</a><a href="experiences.html#dining">Dining</a><a href="experiences.html#wellness">Wellness</a><a href="support.html#events">Meetings &amp; Events</a>' +
          '</div>' +
          '<div class="ftr__col"><h5>Guest Services</h5>' +
            '<a href="hotels.html">Book a Room</a><a href="manage-booking.html">Manage Booking</a><a href="offers.html#member">KAS Member</a><a href="offers.html">Special Offers</a><a href="support.html">Gift Cards</a>' +
          '</div>' +
          '<div class="ftr__col ftr__contact"><h5>Contact</h5>' +
            '<a href="' + CT.tel + '" class="ftr-contact-row">' + U.icon('phone', 15) + '<span>' + U.esc(CT.displayPhone) + '</span></a>' +
            '<a href="mailto:' + CT.email + '" class="ftr-contact-row">' + U.icon('mail', 15) + '<span>' + U.esc(CT.email) + '</span></a>' +
          '</div>' +
          '<div class="ftr__col ftr__news"><h5>Stay in the know</h5>' +
            '<p>Seasonal offers, new openings, and stories from the KAS collection.</p>' +
            '<form class="news" onsubmit="return false"><input type="email" aria-label="Email address" placeholder="Email của bạn"><button type="submit" aria-label="Subscribe">' + U.icon('send', 15) + '</button></form>' +
          '</div>' +
        '</div>' +
        '<div class="ftr__btm"><span>© 2026 KAS Hotel Collection. All rights reserved.</span><div class="ftr__legal"><a href="reference.html">Privacy Policy</a><a href="reference.html">Terms of Service</a><a href="support.html#contact">Contact</a></div></div>' +
      '</div>';
  }

  /* ---------------- chat + back to top ---------------- */
  function renderFloat() {
    // One floating contact widget for the whole site: Call / Zalo / WhatsApp.
    global.Contact.floatingWidget();
    if (!U.$('.totop')) {
      var t = U.el('button', { class: 'totop noprint', type: 'button', 'aria-label': 'Back to top' }, U.icon('arrU', 17));
      t.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
      document.body.appendChild(t);
      window.addEventListener('scroll', function () {
        t.classList.toggle('show', window.scrollY > 520);
      }, { passive: true });
    }
  }

  /* ---------------- scroll reveal ---------------- */
  function reveal() {
    var els = U.$$('.fade-up');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: .1, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------------- mini carousel (cards) ---------------- */
  function miniCarousel(root) {
    var imgs = U.$$('img', root), dots = U.$$('.mini__dots i', root), i = 0;
    if (imgs.length < 2) {
      var nv = U.$$('.mini__nav', root); nv.forEach(function (n) { n.style.display = 'none'; });
      var dd = U.$('.mini__dots', root); if (dd) dd.style.display = 'none';
      return;
    }
    function go(n) {
      i = (n + imgs.length) % imgs.length;
      imgs.forEach(function (im, k) { im.classList.toggle('is-on', k === i); });
      dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); });
    }
    var p = U.$('.mini__nav--prev', root), n2 = U.$('.mini__nav--next', root);
    if (p) p.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(i - 1); });
    if (n2) n2.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(i + 1); });
    // touch swipe
    var x0 = null;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
      x0 = null;
    }, { passive: true });
  }
  function miniHTML(images, alt) {
    var list = (images || []).slice(0, 6);
    if (!list.length) return '<div class="imgfall"><span>Image unavailable from source</span></div>';
    return '<div class="mini">' +
      list.map(function (s, i) {
        return U.img(s, alt, i === 0 ? 'is-on' : '');
      }).join('') +
      (list.length > 1 ?
        '<button class="mini__nav mini__nav--prev" type="button" aria-label="Previous photo">' + U.icon('chevL', 15) + '</button>' +
        '<button class="mini__nav mini__nav--next" type="button" aria-label="Next photo">' + U.icon('chevR', 15) + '</button>' +
        '<div class="mini__dots">' + list.map(function (_, i) { return '<i class="' + (i === 0 ? 'is-on' : '') + '"></i>'; }).join('') + '</div>'
        : '') +
      '</div>';
  }

  /* ---------------- full gallery + lightbox ---------------- */
  /**
   * @param {Element} host
   * @param {string[]} images
   * @param {string} alt
   * @param {Object} [opts] {ownCount, ownLabel, siblingLabel}
   *        When `ownCount` is given the gallery is two-tier: the first
   *        `ownCount` photos belong to the selected room type, the rest are
   *        other rooms at the same property. A caption states which tier the
   *        visible photo is from, so the two are never silently conflated.
   */
  function gallery(host, images, alt, opts) {
    if (!host) return;
    opts = opts || {};
    var list = (images || []).filter(Boolean);
    if (!list.length) { host.innerHTML = '<div class="gal__main"><div class="imgfall"><span>Image unavailable from source</span></div></div>'; return; }
    var i = 0, MAXT = 6;

    host.innerHTML =
      '<div class="gal__main">' + U.img(list[0], alt, '', false) +
        (list.length > 1 ?
          '<button class="gal__nav gal__nav--prev" type="button" aria-label="Previous photo">' + U.icon('chevL', 18) + '</button>' +
          '<button class="gal__nav gal__nav--next" type="button" aria-label="Next photo">' + U.icon('chevR', 18) + '</button>' : '') +
        '<span class="gal__count">1 / ' + list.length + '</span>' +
        (opts.ownCount != null ? '<span class="gal__tier" id="galTier"></span>' : '') +
      '</div>' +
      '<div class="gal__thumbs">' +
        list.slice(0, MAXT).map(function (s, k) {
          var more = (k === MAXT - 1 && list.length > MAXT);
          var sib = (opts.ownCount != null && k >= opts.ownCount);
          return '<button class="gal__t' + (k === 0 ? ' is-active' : '') + (sib ? ' gal__t--sib' : '') +
            '" type="button" data-i="' + k + '" aria-label="Photo ' + (k + 1) + '">' +
            U.img(s, alt, '', true, false) + (more ? '<span class="gal__more">+' + (list.length - MAXT + 1) + '<br>View all</span>' : '') + '</button>';
        }).join('') +
      '</div>';

    var main = U.$('.gal__main img', host),
        cnt  = U.$('.gal__count', host),
        tier = U.$('#galTier', host),
        ths  = U.$$('.gal__t', host);

    function show(n) {
      i = (n + list.length) % list.length;
      if (main) { main.src = list[i]; main.style.display = ''; }
      var fb = U.$('.gal__main .imgfall', host); if (fb) fb.remove();
      if (cnt) cnt.textContent = (i + 1) + ' / ' + list.length;
      if (tier) {
        var isOwn = i < opts.ownCount;
        tier.textContent = isOwn
          ? (opts.ownLabel || 'This room type')
          : (opts.siblingLabel || 'Another room at this property');
        tier.classList.toggle('gal__tier--sib', !isOwn);
      }
      ths.forEach(function (t, k) { t.classList.toggle('is-active', k === i); });
    }
    if (tier) show(0);
    var pv = U.$('.gal__nav--prev', host), nx = U.$('.gal__nav--next', host);
    if (pv) pv.addEventListener('click', function () { show(i - 1); });
    if (nx) nx.addEventListener('click', function () { show(i + 1); });
    ths.forEach(function (t) {
      t.addEventListener('click', function () {
        var k = +t.dataset.i;
        if (U.$('.gal__more', t)) openLightbox(list, k, alt); else show(k);
      });
    });
    var mainBox = U.$('.gal__main', host);
    if (mainBox) mainBox.addEventListener('click', function (e) {
      if (e.target.closest('.gal__nav')) return;
      openLightbox(list, i, alt);
    });
    // swipe
    var x0 = null;
    if (mainBox) {
      mainBox.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      mainBox.addEventListener('touchend', function (e) {
        if (x0 == null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
        x0 = null;
      }, { passive: true });
    }
    // keyboard — one handler per gallery host; re-rendering replaces it instead of stacking listeners
    if (host.__kasGalKey) document.removeEventListener('keydown', host.__kasGalKey);
    host.__kasGalKey = function (e) {
      if (!host.isConnected || !U.$('.gal__main', host)) return;
      if (U.$('.lb.open')) return;
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;  // arrows move the caret / change a date there
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    };
    document.addEventListener('keydown', host.__kasGalKey);
    return { show: show };
  }

  function openLightbox(list, start, alt) {
    var lb = U.$('.lb');
    if (!lb) {
      lb = U.el('div', { class: 'lb' });
      lb.innerHTML =
        '<button class="lb__x" type="button" aria-label="Close">' + U.icon('x', 24) + '</button>' +
        '<button class="lb__nav lb__nav--prev" type="button" aria-label="Previous">' + U.icon('chevL', 30) + '</button>' +
        '<img alt=""><button class="lb__nav lb__nav--next" type="button" aria-label="Next">' + U.icon('chevR', 30) + '</button>' +
        '<div class="lb__cap"></div>';
      document.body.appendChild(lb);
    }
    var im = U.$('img', lb), cap = U.$('.lb__cap', lb), i = start || 0;
    function show(n) {
      i = (n + list.length) % list.length;
      im.src = list[i];
      cap.textContent = (alt || '') + '  ·  ' + (i + 1) + ' / ' + list.length;
    }
    show(i);
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';

    function close() { lb.classList.remove('open'); document.body.style.overflow = ''; document.removeEventListener('keydown', key); }
    function key(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    }
    U.$('.lb__x', lb).onclick = close;
    U.$('.lb__nav--prev', lb).onclick = function () { show(i - 1); };
    U.$('.lb__nav--next', lb).onclick = function () { show(i + 1); };
    lb.onclick = function (e) { if (e.target === lb) close(); };
    document.addEventListener('keydown', key);

    var x0 = null;
    im.ontouchstart = function (e) { x0 = e.touches[0].clientX; };
    im.ontouchend = function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
      x0 = null;
    };
  }

  /* ---------------- stepper ---------------- */
  var STEPS = [
    { t: 'Search',           s: 'Dates & guests' },
    { t: 'Select Room',      s: 'Choose your stay' },
    { t: 'Guest Details',    s: 'Add your information' },
    { t: 'Review & Confirm', s: 'Secure your booking' },
    { t: 'Confirmed',        s: 'All set!' }
  ];
  function renderSteps(host, current, subs) {
    if (!host) return;
    host.className = 'steps noprint';
    var n = STEPS.length;
    var html = '<div class="container steps__in">';
    for (var i = 0; i < n; i++) {
      var st = i < current ? 'is-done' : (i === current ? 'is-on' : '');
      var sub = (subs && subs[i]) || STEPS[i].s;
      html += '<div class="step ' + st + '">' +
        '<span class="step__n">' + (i < current ? U.icon('check', 14) : (i + 1)) + '</span>' +
        '<span class="step__t"><b>' + STEPS[i].t + '</b><span>' + U.esc(sub) + '</span></span></div>';
      if (i < n - 1) html += '<span class="step__line' + (i < current ? ' is-done' : '') + '"></span>';
    }
    host.innerHTML = html + '</div>';
  }

  /* ---------------- modal ---------------- */
  function modal(opts) {
    var m = U.el('div', { class: 'modal' });
    m.innerHTML =
      '<div class="modal__box"><div class="modal__b">' +
        (opts.icon ? '<div style="margin-bottom:14px;color:var(--' + (opts.tone || 'gold-dk') + ')">' + U.icon(opts.icon, 30) + '</div>' : '') +
        '<h3>' + U.esc(opts.title) + '</h3><p class="muted" style="font-size:.9rem">' + (opts.body || '') + '</p></div>' +
        '<div class="modal__ft">' +
          '<button class="btn btn--ghost" data-a="cancel">' + U.esc(opts.cancel || 'Cancel') + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn--dark' : 'btn--gold') + '" data-a="ok">' + U.esc(opts.ok || 'Confirm') + '</button>' +
        '</div></div>';
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    function close() { m.classList.remove('open'); document.body.style.overflow = ''; setTimeout(function () { m.remove(); }, 240); }
    U.$('[data-a=cancel]', m).onclick = function () { close(); opts.onCancel && opts.onCancel(); };
    U.$('[data-a=ok]', m).onclick = function () { close(); opts.onOk && opts.onOk(); };
    m.onclick = function (e) { if (e.target === m) close(); };
    return { close: close };
  }

  /* ---------------- shared chips ---------------- */
  function amenityIcon(name) {
    var n = String(name).toLowerCase();
    if (/wi-?fi|internet/.test(n)) return 'wifi';
    if (/breakfast|restaurant|dining|cuisine/.test(n)) return 'utensils';
    if (/bar|lounge|rooftop|tea/.test(n)) return 'coffee';
    if (/gym|fitness/.test(n)) return 'dumb';
    if (/spa|wellness|sauna/.test(n)) return 'leaf';
    if (/park|car|shuttle|airport|transfer|taxi/.test(n)) return 'car';
    if (/front desk|reception|24/.test(n)) return 'bell';
    if (/laundry|dry clean|housekeep|ironing/.test(n)) return 'spark';
    if (/safe|security|cctv/.test(n)) return 'safe';
    if (/elevator|lift/.test(n)) return 'door';
    if (/fridge|refrigerat|minibar/.test(n)) return 'fridge';
    if (/tv|television/.test(n)) return 'tv';
    if (/air condition|climate/.test(n)) return 'ac';
    if (/hair/.test(n)) return 'hair';
    if (/bath|shower|toilet/.test(n)) return 'bath';
    if (/balcon|terrace/.test(n)) return 'view';
    if (/luggage|baggage|storage|concierge/.test(n)) return 'key';
    if (/currency|exchange|payment/.test(n)) return 'wallet';
    if (/smok/.test(n)) return 'leaf';
    return 'checkC';
  }


  /* ---------------- member sign-in / join ---------------- */
  function authSession() {
    try { return JSON.parse(localStorage.getItem('kas-member-session') || 'null'); } catch (e) { return null; }
  }
  function authAccounts() {
    try { return JSON.parse(localStorage.getItem('kas-member-accounts') || '[]'); } catch (e) { return []; }
  }
  function saveAccounts(a) { try { localStorage.setItem('kas-member-accounts', JSON.stringify(a)); } catch (e) {} }

  function openAuth(mode) {
    var existing = U.$('.kas-auth');
    if (existing) existing.remove();
    var isJoin = mode === 'join';
    var m = U.el('div', { class: 'kas-auth is-open' });
    m.innerHTML =
      '<div class="kas-auth__box" role="dialog" aria-modal="true" aria-label="KAS member">' +
        '<button class="kas-auth__close" type="button" aria-label="Close">×</button>' +
        '<div class="kas-auth__brand"><img src="assets/logo/kas-hotel-collection.svg" alt="KAS Hotel Collection"></div>' +
        '<div class="kas-auth__eyebrow">KAS Rewards</div>' +
        '<h2>' + (isJoin ? 'Create your KAS account' : 'Welcome back') + '</h2>' +
        '<p class="kas-auth__sub">' + (isJoin ? 'Join KAS for member benefits and a smoother booking experience.' : 'Sign in to manage your KAS membership and bookings.') + '</p>' +
        (isJoin ? '<div class="kas-auth__field"><label for="kasAuthName">Full name</label><input id="kasAuthName" type="text" autocomplete="name" placeholder="Your name"></div>' : '') +
        '<div class="kas-auth__field"><label for="kasAuthEmail">Email *</label><input id="kasAuthEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>' +
        '<div class="kas-auth__field"><label for="kasAuthPassword">Password *</label><input id="kasAuthPassword" type="password" autocomplete="' + (isJoin?'new-password':'current-password') + '" placeholder="At least 8 characters"></div>' +
        (isJoin ? '' : '<label class="kas-auth__remember"><input id="kasAuthRemember" type="checkbox"> Remember me on this device</label>') +
        '<button class="kas-auth__submit" id="kasAuthSubmit" type="button">' + (isJoin ? 'CREATE ACCOUNT' : 'SIGN IN') + '</button>' +
        '<div class="kas-auth__message" id="kasAuthMessage"></div>' +
        '<div class="kas-auth__switch">' + (isJoin ? 'Already a member?' : 'New to KAS?') + ' <button type="button" id="kasAuthSwitch">' + (isJoin ? 'Sign in' : 'Create an account') + '</button></div>' +
      '</div>';
    document.body.appendChild(m);

    function close(){m.classList.remove('is-open');setTimeout(function(){m.remove()},180);document.body.style.overflow='';}
    m.querySelector('.kas-auth__close').onclick=close;
    m.addEventListener('click',function(e){if(e.target===m)close()});
    document.body.style.overflow='hidden';

    m.querySelector('#kasAuthSwitch').onclick=function(){close();setTimeout(function(){openAuth(isJoin?'login':'join')},40)};
    m.querySelector('#kasAuthSubmit').onclick=function(){
      var email=String(m.querySelector('#kasAuthEmail').value||'').trim().toLowerCase();
      var pw=String(m.querySelector('#kasAuthPassword').value||'');
      var msg=m.querySelector('#kasAuthMessage');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.textContent='Please enter a valid email address.';return}
      if(pw.length<8){msg.textContent='Password must be at least 8 characters.';return}
      if(isJoin){
        var name=String(m.querySelector('#kasAuthName').value||'').trim();
        if(!name){msg.textContent='Please enter your full name.';return}
        var accounts=authAccounts();
        if(accounts.some(function(a){return a.email===email})){msg.textContent='This email is already registered. Please sign in.';return}
        accounts.push({name:name,email:email,password:pw});
        saveAccounts(accounts);
        try{localStorage.setItem('kas-member-session',JSON.stringify({name:name,email:email}))}catch(e){}
        msg.textContent='Account created. Welcome to KAS.';
        setTimeout(close,700);
      }else{
        var accounts=authAccounts();
        var found=accounts.find(function(a){return a.email===email && a.password===pw});
        if(!found){msg.textContent='Email or password is incorrect.';return}
        try{localStorage.setItem('kas-member-session',JSON.stringify({name:found.name,email:found.email}))}catch(e){}
        msg.textContent='Signed in successfully.';
        setTimeout(close,650);
      }
    };
  }

  /* ---------------- first-visit welcome ---------------- */
  var WELCOME_KEY = 'kas-welcome-seen';

  function welcomeSeen() {
    try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch (e) { return false; }
  }

  function markWelcomeSeen() {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) {}
  }

  function openWelcome() {
    if (welcomeSeen() || U.$('.kas-welcome')) return;

    function renderWelcome(imageUrl) {
      if (welcomeSeen() || U.$('.kas-welcome')) return;
      var m = U.el('div', { class: 'kas-welcome is-open' });
      m.innerHTML =
        '<div class="kas-welcome__box" role="dialog" aria-modal="true" aria-labelledby="kasWelcomeTitle">' +
          '<div class="kas-welcome__visual" aria-hidden="true">' +
            '<img src="'+String(imageUrl||'https://images.unsplash.com/photo-1503539680555-732099a55a56?auto=format&fit=crop&w=1400&q=90').replace(/"/g,'&quot;')+'" alt="">' +
            '<div class="kas-welcome__visual-copy"><span>AMORE</span><span>MEANINGFUL</span><span>STAYS.</span></div>' +
            '<small>KAS HOTEL</small>' +
          '</div>' +
          '<div class="kas-welcome__content">' +
            '<button class="kas-welcome__close" type="button" aria-label="Close">×</button>' +
            '<img class="kas-welcome__logo" src="assets/logo/kas-hotel-collection.svg" alt="KAS Hotel Collection">' +
          '<div class="kas-welcome__eyebrow" data-welcome="eyebrow">WELCOME TO KAS</div>' +
          '<h2 id="kasWelcomeTitle" data-welcome="title">Choose your language and discover<br>the KAS experience.</h2>' +
          '<div class="kas-welcome__label" data-welcome="language">LANGUAGE</div>' +
          '<div class="kas-welcome__langs" role="group" aria-label="Language">' +
            '<button type="button" class="kas-welcome__lang" data-welcome-lang="en"><span>English</span><i>●</i></button>' +
            '<button type="button" class="kas-welcome__lang" data-welcome-lang="vi"><span>Tiếng Việt</span><i>○</i></button>' +
          '</div>' +
          '<div class="kas-welcome__rule"></div>' +
          '<div class="kas-welcome__eyebrow kas-welcome__choice-title" data-welcome="choiceEyebrow">CHOOSE HOW YOU\'D LIKE TO CONTINUE</div>' +
          '<div class="kas-welcome__choices">' +
            '<div class="kas-welcome__choice">' +
              '<div class="kas-welcome__choice-heading" data-welcome="guestHeading">CONTINUE AS GUEST</div>' +
              '<p class="kas-welcome__choice-copy" data-welcome="guestCopy">Explore KAS and make a reservation without becoming a member.</p>' +
              '<button class="kas-welcome__choice-btn kas-welcome__choice-btn--dark" type="button" data-welcome-action="guest"><span data-welcome="guest">CONTINUE AS GUEST</span><b>→</b></button>' +
            '</div>' +
            '<div class="kas-welcome__choice kas-welcome__choice--member">' +
              '<div class="kas-welcome__choice-heading" data-welcome="memberEyebrow">BECOME A KAS MEMBER</div>' +
              '<p class="kas-welcome__choice-copy" data-welcome="memberCopy">Enjoy exclusive benefits while keeping the freedom to book as usual.</p>' +
              '<ul class="kas-welcome__benefits">' +
                '<li data-welcome="benefit1">10–20% member offers</li>' +
                '<li data-welcome="benefit2">Early check-in / late check-out up to 2 hours</li>' +
                '<li data-welcome="benefit4">Easier booking management</li>' +
                '<li data-welcome="benefit3">Free cancellation until 12:00 on check-in day</li>' +
              '</ul>' +
              '<button class="kas-welcome__choice-btn" type="button" data-welcome-action="join"><span data-welcome="join">JOIN KAS MEMBER</span><b>→</b></button>' +
            '</div>' +
          '</div>' +
          '<button class="kas-welcome__signin" type="button" data-welcome-action="signin" data-welcome="signin">SIGN IN</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    document.body.style.overflow = 'hidden';

    var copy = {
      en: {
        eyebrow:'WELCOME TO KAS', title:'Choose your language and discover<br>the KAS experience.', language:'LANGUAGE',
        choiceEyebrow:'CHOOSE HOW YOU\'D LIKE TO CONTINUE', guestHeading:'CONTINUE AS GUEST',
        guestCopy:'Explore KAS and make a reservation without becoming a member.',
        memberEyebrow:'BECOME A KAS MEMBER',
        memberCopy:'Enjoy exclusive benefits while keeping the freedom to book as usual.',
        benefit1:'10–20% member offers', benefit2:'Early check-in / late check-out up to 2 hours', benefit3:'Free cancellation until 12:00 on check-in day', benefit4:'Easier booking management', join:'JOIN KAS MEMBER', signin:'SIGN IN', guest:'CONTINUE AS GUEST'
      },
      vi: {
        eyebrow:'CHÀO MỪNG ĐẾN VỚI KAS', title:'Chọn ngôn ngữ và khám phá<br>trải nghiệm KAS.', language:'NGÔN NGỮ',
        choiceEyebrow:'CHỌN CÁCH BẠN MUỐN TIẾP TỤC', guestHeading:'TIẾP TỤC VỚI TƯ CÁCH KHÁCH',
        guestCopy:'Khám phá KAS và đặt phòng mà không cần trở thành thành viên.',
        memberEyebrow:'TRỞ THÀNH THÀNH VIÊN KAS',
        memberCopy:'Tận hưởng quyền lợi riêng mà vẫn tự do đặt phòng theo cách bạn muốn.',
        benefit1:'Ưu đãi 10–20%', benefit2:'Check-in sớm / check-out muộn tối đa 2 giờ', benefit3:'Hủy phòng miễn phí đến 12:00 cùng ngày check-in', benefit4:'Quản lý đặt phòng dễ dàng', join:'THAM GIA KAS MEMBER', signin:'ĐĂNG NHẬP', guest:'TIẾP TỤC VỚI TƯ CÁCH KHÁCH'
      }
    };

    function setWelcomeLanguage(lang) {
      var l = lang === 'vi' ? 'vi' : 'en', t = copy[l];
      Object.keys(t).forEach(function(key){ var el = m.querySelector('[data-welcome="'+key+'"]'); if(el) el.innerHTML=t[key]; });
      m.querySelectorAll('[data-welcome-lang]').forEach(function(btn){
        var active=btn.getAttribute('data-welcome-lang')===l;
        btn.classList.toggle('is-active',active);
        btn.setAttribute('aria-pressed',active?'true':'false');
        var dot=btn.querySelector('i'); if(dot) dot.textContent=active?'●':'○';
      });
    }
    function close(){
      markWelcomeSeen();
      document.removeEventListener('keydown',m.__kasEscape);
      m.classList.remove('is-open');
      document.body.style.overflow='';
      setTimeout(function(){m.remove()},180);
    }
    m.__kasEscape=function(e){if(e.key==='Escape')close()};
    m.querySelector('.kas-welcome__close').onclick=close;
    m.querySelector('[data-welcome-action="guest"]').onclick=close;
    m.addEventListener('click',function(e){if(e.target===m)close()});
    m.querySelector('[data-welcome-action="join"]').onclick=function(){ close(); setTimeout(function(){openAuth('join')},190); };
    m.querySelector('[data-welcome-action="signin"]').onclick=function(){ close(); setTimeout(function(){openAuth('login')},190); };
    m.querySelectorAll('[data-welcome-lang]').forEach(function(btn){
      btn.onclick=function(){
        var lang=btn.getAttribute('data-welcome-lang');
        if(global.KAS_I18N) global.KAS_I18N.setLanguage(lang);
        setWelcomeLanguage(lang);
      };
    });
      document.addEventListener('keydown',m.__kasEscape);
      setWelcomeLanguage(global.KAS_I18N ? global.KAS_I18N.getLanguage() : 'en');
    }

    fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(c){
      var item=c&&c.siteImages&&c.siteImages['page.hero.welcome'];
      renderWelcome(item&&item.url ? item.url : 'https://images.unsplash.com/photo-1503539680555-732099a55a56?auto=format&fit=crop&w=1400&q=90');
    }).catch(function(){
      renderWelcome('https://images.unsplash.com/photo-1503539680555-732099a55a56?auto=format&fit=crop&w=1400&q=90');
    });
  }

  function bindAuthButtons(){
    U.$$('.js-kas-auth').forEach(function(b){
      if(b.__kasAuthBound)return;b.__kasAuthBound=true;
      b.addEventListener('click',function(){
        var s=authSession();
        if(s){
          openAuth('login');
          var title=U.$('.kas-auth h2'); if(title) title.textContent='Welcome back, '+s.name;
        }else openAuth('login');
      });
    });
  }

  /* ---------------- boot ---------------- */
  function boot(opts) {
    opts = opts || {};
    renderHeader(opts);
    bindAuthButtons();
    renderFooter();
    renderFloat();
    reveal();
    if (global.KAS_I18N) global.KAS_I18N.init();
    openWelcome();
  }

  global.flagIcon = flagIcon;

  global.App = {
    boot: boot, logo: logo, logoMark: logoMark, flagIcon: flagIcon,
    renderSteps: renderSteps, gallery: gallery, openLightbox: openLightbox,
    miniHTML: miniHTML, miniCarousel: miniCarousel,
    modal: modal, amenityIcon: amenityIcon, reveal: reveal,
    openDrawer: openDrawer, closeDrawer: closeDrawer
  };
})(window);
