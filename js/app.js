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

  // A click can target the backdrop when a text-selection drag starts inside
  // a dialog and ends outside it. Dismiss only when the full press happens on
  // the backdrop, so selecting or dragging content never closes the window.
  function closeOnBackdropPress(surface, close) {
    var pressedBackdrop = false;
    surface.addEventListener('pointerdown', function (event) {
      pressedBackdrop = event.target === surface;
    });
    surface.addEventListener('pointerup', function (event) {
      var shouldClose = pressedBackdrop && event.target === surface;
      pressedBackdrop = false;
      if (shouldClose) close();
    });
    surface.addEventListener('pointercancel', function () { pressedBackdrop = false; });
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
    opts.floating = opts.floating !== false;
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
          '<button class="btn btn--gold btn--sm js-kas-auth" type="button">Sign in</button>' +
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
      var contactBtn = U.$('.contact-trigger', host), contactPanel = U.$('#kasContactPopover', host);
      function resetContactPosition(){
        if(!contactPanel) return;
        contactPanel.style.position = '';
        contactPanel.style.left = '';
        contactPanel.style.right = '';
        contactPanel.style.top = '';
        contactPanel.style.width = '';
        contactPanel.style.setProperty('--contact-arrow-left', '');
      }
      function positionContactPanel(){
        if(!contactBtn || !contactPanel) return;
        var rect = contactBtn.getBoundingClientRect();
        var mobile = window.matchMedia('(max-width: 700px)').matches;
        if(mobile){
          var viewport = document.documentElement.clientWidth || window.innerWidth;
          var width = Math.min(320, Math.max(220, viewport - 10));
          var left = Math.max(5, Math.min(rect.right - width, viewport - width - 5));
          contactPanel.style.position = 'fixed';
          contactPanel.style.left = left + 'px';
          contactPanel.style.right = 'auto';
          contactPanel.style.top = Math.min(rect.bottom + 8, window.innerHeight - 120) + 'px';
          contactPanel.style.width = width + 'px';
          contactPanel.style.setProperty('--contact-arrow-left', Math.max(12, Math.min(width - 20, rect.left + rect.width / 2 - left - 6)) + 'px');
        } else { resetContactPosition(); }
      }
      function closeContact(){
        if(contactPanel){ contactPanel.hidden = true; resetContactPosition(); }
        if(contactBtn) contactBtn.setAttribute('aria-expanded','false');
      }
      if(contactBtn && contactPanel){
        contactBtn.addEventListener('click', function(e){
          e.stopPropagation(); close();
          var open = contactPanel.hidden;
          contactPanel.hidden = !open;
          contactBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
          if(open) positionContactPanel(); else resetContactPosition();
        });
        contactPanel.addEventListener('click', function(e){ e.stopPropagation(); });
        window.addEventListener('resize', function(){ if(!contactPanel.hidden) positionContactPanel(); }, {passive:true});
        window.addEventListener('scroll', function(){ if(!contactPanel.hidden && window.matchMedia('(max-width: 700px)').matches) positionContactPanel(); }, {passive:true});
      }
      btn.addEventListener('click', function(e){ e.stopPropagation(); closeContact(); var open = wrap.classList.toggle('is-open'); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); });
      U.$$('.lang-option', menu).forEach(function(opt){
        opt.addEventListener('click', function(){
          var select = U.$('.lang-select', wrap), lang = opt.getAttribute('data-lang');
          if (!select) return;
          select.value = lang;
          select.dispatchEvent(new Event('change', {bubbles:true}));
          var labels = host.querySelectorAll('[data-contact-label]');
          labels.forEach(function(label){
            var key = label.getAttribute('data-contact-label');
            if(lang === 'vi') label.innerHTML = key === 'partners' ? 'Đối tác du lịch<br>và đối tác doanh nghiệp' : 'Đặt phòng / Kinh doanh';
            else label.innerHTML = key === 'partners' ? 'Travel Partners<br>and Corporate Partners' : 'Room Reservations / Sales';
          });
          close();
        });
      });
      if (host.__kasLangClose) document.removeEventListener('click', host.__kasLangClose);
      host.__kasLangClose = function(){ close(); closeContact(); };
      document.addEventListener('click', host.__kasLangClose);
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ close(); closeContact(); } });
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
    closeOnBackdropPress(d, closeDrawer);
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
            '<div class="ftr-contact-group"><span class="ftr-contact-label" data-i18n="Travel Partners &amp; Corporate Partners">Travel Partners &amp; Corporate Partners</span>' +
              '<a href="' + CT.tel + '" class="ftr-contact-row">' + U.icon('phone', 15) + '<span>' + U.esc(CT.displayPhone) + '</span></a></div>' +
            (Array.isArray(CT.reservationPhones) && CT.reservationPhones.length ? '<div class="ftr-contact-group"><span class="ftr-contact-label" data-i18n="Room Reservations / Sales">Room Reservations / Sales</span>' + CT.reservationPhones.map(function (p) {
              return '<a href="' + U.esc(p.tel) + '" class="ftr-contact-row">' + U.icon('phone', 15) + '<span>' + U.esc(p.displayPhone) + '</span></a>';
            }).join('') + '</div>' : '') +
            '<a href="mailto:' + CT.email + '" class="ftr-contact-row">' + U.icon('mail', 15) + '<span>' + U.esc(CT.email) + '</span></a>' +
            (CT.hqAddress ? '<p class="ftr-contact-address">' + U.icon('map-pin', 15) + '<span>' + U.esc(CT.hqAddress) + '</span></p>' : '') +
          '</div>' +
          '<div class="ftr__col ftr__news"><h5>Stay in the know</h5>' +
            '<p>Seasonal offers, new openings, and stories from the KAS collection.</p>' +
            '<form class="news" onsubmit="return false"><input type="email" aria-label="Email address" placeholder="Email của bạn"><button type="submit" aria-label="Subscribe">' + U.icon('send', 15) + '</button></form>' +
          '</div>' +
        '</div>' +
        '<div class="ftr__btm"><span>© 2026 KAS Hotel Collection. All rights reserved.</span><div class="ftr__legal"><a href="reference.html">Privacy Policy</a><a href="reference.html">Terms of Service</a><a href="support.html#contact">Contact</a></div></div>' +
      '</div>';
  }

  /* ---------------- footer V3 (homepage only) ----------------
     Homepage V3 footer: five groups. Other pages keep renderFooter() so their
     layout is untouched. Booking partners and social channels have no verified
     URL in the code or config yet, so they are labels, not links. */
  function renderFooterV3() {
    var host = U.$('#ftr'); if (!host) return;
    var CT = D.config.contact || {};
    function col(title, items) {
      return '<div class="ftr-v3__col"><h5>' + title + '</h5><ul>' + items.map(function (x) {
        return '<li>' + (x[1] ? '<a href="' + x[1] + '">' + x[0] + '</a>' : '<span>' + x[0] + '</span>') + '</li>';
      }).join('') + '</ul></div>';
    }
    var phones = [];
    if (CT.tel && CT.displayPhone) phones.push([CT.tel, CT.displayPhone]);
    (Array.isArray(CT.reservationPhones) ? CT.reservationPhones : []).forEach(function (p) {
      if (p && p.tel && p.displayPhone) phones.push([p.tel, p.displayPhone]);
    });
    host.className = 'ftr ftr-v3';
    host.innerHTML =
      '<div class="ftr-v3__wrap">' +
        '<div class="ftr-v3__top">' +
          '<div class="ftr-v3__brand">' + logo(false) +
            '<p>Distinctive stays in the heart of Ho Chi Minh City, created with thoughtful service and memorable experiences.</p></div>' +
          col('Our Stays', [['Our Properties', 'hotels.html'], ['Rooms &amp; Suites', 'hotels.html']]) +
          col('Discover KAS', [['About KAS', 'about.html'], ['City Guide', 'city-guide.html'], ['Special Offers', 'offers.html'], ['Member Benefits', 'offers.html#member']]) +
          col('Guest Services', [['My Booking', 'manage-booking.html'], ['Contact Us', 'support.html#contact'], ['Member Policy', 'offers.html#member'], ['FAQ &amp; Cancellation', 'support.html#faq']]) +
          col('Booking Partners', [['Booking.com'], ['Agoda'], ['Trip.com'], ['Traveloka']]) +
          col('Follow KAS', [['TikTok'], ['Facebook']]) +
        '</div>' +
        '<div class="ftr-v3__contact">' +
          phones.map(function (p) { return '<a href="' + U.esc(p[0]) + '">' + U.icon('phone', 15) + '<span>' + U.esc(p[1]) + '</span></a>'; }).join('') +
          (CT.email ? '<a href="mailto:' + U.esc(CT.email) + '">' + U.icon('mail', 15) + '<span>' + U.esc(CT.email) + '</span></a>' : '') +
        '</div>' +
        '<div class="ftr-v3__bottom"><span>© 2026 KAS Hotel Collection. All rights reserved.</span>' +
          '<div class="ftr-v3__legal"><a href="reference.html">Privacy Policy</a><a href="reference.html">Terms &amp; Conditions</a><a href="support.html#booking">Booking Policy</a></div></div>' +
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
    closeOnBackdropPress(lb, close);
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
    { t: 'Review request', s: 'Check your information' },
    { t: 'Request sent',     s: 'Hotel review pending' }
  ];
  function renderSteps(host, current, subs) {
    if (!host) return;
    host.className = 'steps noprint';
    var n = STEPS.length;
    var html = '<div class="container steps__in">';
    for (var i = 0; i < n; i++) {
      var st = i < current ? 'is-done' : (i === current ? 'is-on' : '');
      var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';
      var titles=vi?['Tìm kiếm','Chọn phòng','Thông tin khách','Kiểm tra yêu cầu','Đã gửi yêu cầu']:STEPS.map(function(step){return step.t;});
      var subtitles=vi?['Ngày và số khách','Chọn nơi lưu trú','Bổ sung thông tin','Kiểm tra trước khi gửi','Chờ khách sạn xem xét']:STEPS.map(function(step){return step.s;});
      var sub = (subs && subs[i]) || subtitles[i];
      html += '<div class="step ' + st + '">' +
        '<span class="step__n">' + (i < current ? U.icon('check', 14) : (i + 1)) + '</span>' +
        '<span class="step__t"><b>' + titles[i] + '</b><span>' + U.esc(sub) + '</span></span></div>';
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
    closeOnBackdropPress(m, close);
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
  var kasMemberSession = null;
  function authSession() { return kasMemberSession; }
  var kasMemberSignedIn = null;
  /* Every sign-in, sign-out and session check lands here; pages that depend on
     the account (saved hotels) listen for the change instead of polling. */
  /* A non-secret hint of the last known sign-in state, so anonymous visitors do not
     ask /me/profile on every page (two 401s each time). '1' signed in, '0' signed
     out, absent = unknown (first visit or just upgraded): ask once. The session itself
     stays in HttpOnly cookies; this only decides whether asking is worth it. */
  var SESSION_HINT_KEY = 'kas_session_hint';
  function sessionHint() { try { return localStorage.getItem(SESSION_HINT_KEY); } catch (e) { return null; } }
  function rememberSessionHint(signedIn) { try { localStorage.setItem(SESSION_HINT_KEY, signedIn ? '1' : '0'); } catch (e) {} }
  function persistSession(session) {
    kasMemberSession = session || null;
    var signedIn = !!kasMemberSession;
    rememberSessionHint(signedIn);
    if (signedIn === kasMemberSignedIn) return;
    kasMemberSignedIn = signedIn;
    try { global.dispatchEvent(new CustomEvent('kas:member-changed', { detail: { signedIn: signedIn } })); } catch (e) {}
  }
  /* The header's view of the member, from the server's profile. The photo URL is the
     versioned one the server returns, so a new photo is a new URL and never a cached old one. */
  function sessionFromProfile(profile) {
    return { name: profile.fullName, email: profile.email, phone: profile.phone, tier: profile.tier, points: profile.points,
      avatar: profile.avatarUrl && global.KAS_API && global.KAS_API.url ? global.KAS_API.url(profile.avatarUrl) : '' };
  }
  /* Called by the profile page after the server confirmed a save, so the header changes at once. */
  global.KAS_MEMBER = { update: function (profile) { if (profile) { persistSession(sessionFromProfile(profile)); syncAuthHeader(); } } };
  /* Where the Admin/Partner console lives. It runs on its own host, so its
     session never mixes with a guest session here. The website server says
     where (KAS_CONSOLE_URL -> /site-config.json); window.KAS_CONSOLE_URL still
     overrides it, and locally the console runs beside the site on port 3002. */
  var siteConfigPromise = null;
  function loadSiteConfig() {
    if (!siteConfigPromise) {
      siteConfigPromise = (typeof fetch === 'function'
        ? fetch('/site-config.json', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : {}; })
        : Promise.resolve({})).catch(function () { return {}; });
    }
    return siteConfigPromise;
  }
  function consoleBaseUrl() {
    return loadSiteConfig().then(function (config) {
      var configured = global.KAS_CONSOLE_URL || (config && config.consoleUrl);
      if (configured) return String(configured).replace(/\/+$/, '');
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return location.protocol + '//' + location.hostname + ':3002';
      return '';
    });
  }
  /* A staff account has no customer profile (404). The backend says which
     console it may open — the browser never decides the role — and only then
     does the account menu offer the way in. Customers never see it. */
  function resolveStaffSession(email) {
    if (!global.KAS_API) return Promise.resolve(null);
    return global.KAS_API.request('/api/v1/me/console').then(function (view) {
      var role = view && view.console;
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null;
      return consoleBaseUrl().then(function (base) {
        return {
          name: role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin', email: email || '', staffRole: role,
          consoleUrl: base ? base + (role === 'SUPER_ADMIN' ? '/partner' : '/admin') : ''
        };
      });
    }, function () { return null; });
  }
  function hydrateMemberSession() {
    if (!global.KAS_API) return;
    if (sessionHint() === '0') { persistSession(null); syncAuthHeader(); return; }
    global.KAS_API.profile().then(function (profile) {
      persistSession(sessionFromProfile(profile));
      syncAuthHeader();
    }).catch(function (error) {
      if (error.status === 401 || error.status === 403) {
        persistSession(null);
        syncAuthHeader();
      } else if (error.status === 404) {
        resolveStaffSession('').then(function (staff) { persistSession(staff); syncAuthHeader(); });
      }
    });
  }

  function syncAuthHeader() {
    var host = U.$('#hdr');
    if (!host) return;
    var old = U.$('.js-kas-auth, .kas-user-menu', host);
    if (!old) return;
    var session = authSession();
    if (!session) {
      if (old.classList.contains('kas-user-menu')) {
        var button = U.el('button', { class: 'btn btn--gold btn--sm js-kas-auth', type: 'button' });
        button.textContent = global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'ĐĂNG NHẬP' : 'Sign in';
        button.addEventListener('click', function(){ openAuth('login'); });
        old.replaceWith(button);
      }
      return;
    }
    var name = String(session.name || session.email || 'KAS Member').trim();
    if (old.classList.contains('kas-user-menu')) {
      /* Already drawn: refresh the name and photo in place rather than keeping stale ones. */
      var trigger = U.$('.kas-member-trigger', old);
      if (trigger) trigger.setAttribute('title', name.replace(/[&<>"']/g, ''));
      var nameNode = U.$('.kas-member-trigger__name', old);
      if (nameNode) nameNode.textContent = name;
      var identity = U.$('.kas-user-menu__identity strong', old);
      if (identity) identity.textContent = name;
      renderMemberAvatar(U.$('.kas-avatar', old), name, session.avatar);
      return;
    }
    var wrap = U.el('div', { class: 'kas-user-menu' });
    wrap.innerHTML = '<button class="kas-member-trigger" type="button" aria-label="Member menu" aria-expanded="false" title="' + name.replace(/[&<>"']/g, '') + '"><span class="kas-avatar" aria-hidden="true"></span><span class="kas-member-trigger__name">' + name.replace(/[&<>"']/g, '') + '</span></button>' +
      '<div class="kas-user-menu__panel" role="menu" hidden>' +
      '<div class="kas-user-menu__identity"><strong>' + name.replace(/[&<>"']/g, '') + '</strong><span>' + String(session.email || '').replace(/[&<>"']/g, '') + '</span></div>' +
      (session.staffRole
        ? (session.consoleUrl ? '<a role="menuitem" class="kas-user-menu__admin" href="' + session.consoleUrl.replace(/"/g, '%22') + '">Trang quản trị</a>' : '')
        : '<button type="button" role="menuitem" data-member-action="account">My account</button>' +
          '<a role="menuitem" href="offers.html#member">Chính sách thành viên</a>' +
          '<button type="button" role="menuitem" data-member-action="saved">Saved</button>') +
      '<button type="button" role="menuitem" data-member-action="logout">Đăng xuất</button></div>';
    old.replaceWith(wrap);
    renderMemberAvatar(U.$('.kas-avatar', wrap), name, session.avatar);
    var toggle = U.$('.kas-member-trigger', wrap), panel = U.$('.kas-user-menu__panel', wrap);
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (host.__kasMemberMenuClose) document.removeEventListener('click', host.__kasMemberMenuClose);
    host.__kasMemberMenuClose = function () { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
    document.addEventListener('click', host.__kasMemberMenuClose);
    U.$$('.kas-user-menu__panel [data-member-action]', wrap).forEach(function (item) {
      item.addEventListener('click', function () {
        var action = item.getAttribute('data-member-action');
        panel.hidden = true;
        if (action === 'logout') {
          (global.KAS_API ? global.KAS_API.logout() : Promise.resolve()).catch(function () {}).then(function () {
            persistSession(null);
            if (global.Store && global.Store.clearGuestDetails) global.Store.clearGuestDetails();
            syncAuthHeader();
            window.location.reload();
          });
        } else if (action === 'account') {
          window.location.href = 'manage-booking.html?view=profile';
        } else if (action === 'saved') {
          window.location.href = 'saved-hotels.html';
        }
      });
    });
  }

  /* The member's photo when the account has one, otherwise their initial; a photo that
     fails to load falls back to the initial rather than a broken image. */
  function renderMemberAvatar(node, name, url) {
    if (!node) return;
    var initial = String(name || 'K').trim().charAt(0).toUpperCase() || 'K';
    if (!url) { node.classList.remove('kas-avatar--photo'); node.textContent = initial; return; }
    var current = node.querySelector('img');
    if (current && current.getAttribute('src') === url) return;
    var img = document.createElement('img');
    img.alt = '';
    img.src = url;
    img.onerror = function () { node.classList.remove('kas-avatar--photo'); node.textContent = initial; };
    node.textContent = '';
    node.classList.add('kas-avatar--photo');
    node.appendChild(img);
  }

  function showSavedHotels() {
    window.location.href = 'saved-hotels.html';
  }

  function showMemberNotice(title, message) {
    var existing = U.$('.kas-member-notice'); if (existing) existing.remove();
    var modal = U.el('div', { class: 'kas-auth kas-member-notice is-open' });
    modal.innerHTML = '<div class="kas-auth__box" role="dialog" aria-modal="true"><button class="kas-auth__close" type="button" aria-label="Close">×</button><div class="kas-auth__eyebrow">KAS REWARDS</div><h2>' + title + '</h2><p class="kas-auth__sub">' + message + '</p><button class="kas-auth__submit" type="button">ĐÓNG</button></div>';
    document.body.appendChild(modal);
    function close(){modal.remove();document.body.style.overflow='';}
    modal.querySelector('.kas-auth__close').onclick=close;
    modal.querySelector('.kas-auth__submit').onclick=close;
    closeOnBackdropPress(modal, close);
    document.body.style.overflow='hidden';
  }

  function openAuth(mode, resetToken) {
    var existing = U.$('.kas-auth'); if (existing) existing.remove();
    var isJoin = mode === 'join';
    var isForgot = mode === 'forgot';
    var isReset = mode === 'reset';
    var verificationStage = false, verificationEmail = '';
    /* Kept in memory only, so a verified member is signed in without retyping it. */
    var pendingPassword = '', resendAvailableAt = 0, resendTimer = null;
    var m = U.el('div', { class: 'kas-auth is-open' });
    function render() {
      var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';
      var title = verificationStage ? (vi?'Xác thực email':'Verify your email') : isJoin ? 'Join KAS Rewards' : isForgot ? 'Reset your password' : isReset ? 'Choose a new password' : 'Welcome back';
      var sub = verificationStage ? (vi?'Chúng tôi đã gửi mã gồm 6 chữ số tới':'We sent a six-digit code to') + '<strong class="kas-auth__email">' + U.esc(verificationEmail) + '</strong>' : isJoin ? 'Create an account to manage your bookings and membership.' : isForgot ? 'Enter your email and we will send a reset link if an account matches.' : isReset ? 'Your reset link is valid for 30 minutes and can only be used once.' : 'Sign in to manage your KAS membership and bookings.';
      var content = '<div class="kas-auth__box" role="dialog" aria-modal="true" aria-label="KAS member">' +
        '<button class="kas-auth__close" type="button" aria-label="Close">×</button>' +
        '<div class="kas-auth__brand"><img src="assets/logo/kas-hotel-collection.svg" alt="KAS Hotel Collection"></div>' +
        '<div class="kas-auth__eyebrow">KAS Rewards</div><h2>' + title + '</h2><p class="kas-auth__sub">' + sub + '</p>';
      if (verificationStage) {
        content += '<div class="kas-auth__field kas-auth__field--code"><label for="kasAuthCode">' + (vi?'Mã xác thực':'Verification code') + '</label><input id="kasAuthCode" class="kas-auth__code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" aria-describedby="kasAuthCodeHint" required><p class="kas-auth__hint" id="kasAuthCodeHint">' + (vi?'Mã có hiệu lực trong 30 phút.':'The code is valid for 30 minutes.') + '</p></div><button class="kas-auth__submit" id="kasAuthSubmit" type="button">' + (vi?'XÁC THỰC & ĐĂNG NHẬP':'VERIFY & SIGN IN') + '</button><div class="kas-auth__resend">' + (vi?'Chưa nhận được mã?':'Didn’t get the code?') + ' <button type="button" id="kasAuthResend"></button></div>';
      } else if (isJoin) {
        content += '<div class="kas-auth__field"><label for="kasAuthName">Full name *</label><input id="kasAuthName" type="text" autocomplete="name" required></div><div class="kas-auth__field"><label for="kasAuthEmail">Email *</label><input id="kasAuthEmail" type="email" autocomplete="email" placeholder="you@example.com" required></div><div class="kas-auth__field"><label for="kasAuthPhone">Phone *</label><input id="kasAuthPhone" type="tel" autocomplete="tel" required></div><div class="kas-auth__field"><label for="kasAuthCountry">Nationality *</label><select id="kasAuthCountry" required><option value="">Select nationality</option></select></div><div class="kas-auth__field"><label for="kasAuthPassword">Password (at least 8 characters) *</label><input id="kasAuthPassword" type="password" autocomplete="new-password" minlength="8" required></div><button class="kas-auth__submit" id="kasAuthSubmit" type="button">CREATE ACCOUNT</button>';
      } else if (isForgot) {
        content += '<div class="kas-auth__field"><label for="kasAuthEmail">Email *</label><input id="kasAuthEmail" type="email" autocomplete="email" placeholder="you@example.com" required></div><button class="kas-auth__submit" id="kasAuthSubmit" type="button">SEND RESET LINK</button>';
      } else if (isReset) {
        content += '<div class="kas-auth__field"><label for="kasAuthPassword">New password (at least 8 characters) *</label><input id="kasAuthPassword" type="password" autocomplete="new-password" minlength="8" required></div><button class="kas-auth__submit" id="kasAuthSubmit" type="button">SAVE NEW PASSWORD</button>';
      } else {
        content += '<div class="kas-auth__field"><label for="kasAuthEmail">Email *</label><input id="kasAuthEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="kas-auth__field"><label for="kasAuthPassword">Password *</label><input id="kasAuthPassword" type="password" autocomplete="current-password" placeholder="Your password"></div><label class="kas-auth__remember"><input id="kasAuthRemember" type="checkbox"> Remember me on this device</label><button class="kas-auth__link" type="button" id="kasAuthForgot">Forgot password?</button><button class="kas-auth__submit" id="kasAuthSubmit" type="button">SIGN IN</button>';
      }
      content += '<div class="kas-auth__message" id="kasAuthMessage" aria-live="polite"></div><div class="kas-auth__switch">' + (verificationStage ? '' : isJoin ? 'Đã có tài khoản?' : isForgot || isReset ? 'Đã nhớ mật khẩu?' : 'Chưa là thành viên?') + (verificationStage ? '' : ' <button type="button" id="kasAuthSwitch">' + (isJoin || isForgot || isReset ? 'Đăng nhập' : 'Tạo tài khoản') + '</button>') + '</div></div>';
      m.innerHTML = content;
      if (isJoin && !verificationStage) {
        var countryLocale = global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'vi' : 'en';
        var regionNames = new Intl.DisplayNames([countryLocale], { type: 'region' });
        var countrySelect = m.querySelector('#kasAuthCountry');
        'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ').map(function (code) { return { code: code, name: regionNames.of(code) || code }; })
          .sort(function (a, b) { return a.name.localeCompare(b.name, countryLocale); })
          .forEach(function (country) { var option = document.createElement('option'); option.value = country.code; option.textContent = country.name; countrySelect.appendChild(option); });
      }

      m.querySelector('.kas-auth__close').onclick=close;
      var switchButton=m.querySelector('#kasAuthSwitch'); if(switchButton) switchButton.onclick=function(){close();setTimeout(function(){openAuth(isJoin?'login':(isForgot||isReset?'login':'join'))},40)};
      var forgot = m.querySelector('#kasAuthForgot'); if (forgot) forgot.onclick=function(){close();setTimeout(function(){openAuth('forgot')},40)};
      m.querySelector('#kasAuthSubmit').onclick=submit;
      var resend=m.querySelector('#kasAuthResend');
      var codeInput=m.querySelector('#kasAuthCode');
      if(codeInput){
        codeInput.oninput=function(){var digits=codeInput.value.replace(/\D/g,'').slice(0,6);if(digits!==codeInput.value)codeInput.value=digits;if(digits.length===6&&!m.querySelector('#kasAuthSubmit').disabled)submit();};
        codeInput.onkeydown=function(event){if(event.key==='Enter'){event.preventDefault();submit();}};
      }
      updateResend();
      if(resend) resend.onclick=function(){
        var email=verificationStage ? verificationEmail : String(m.querySelector('#kasAuthEmail').value || '').trim();
        var message=m.querySelector('#kasAuthMessage');
        var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';
        if(!U.isEmail(email)){message.textContent=vi?'Nhập email hợp lệ trước khi gửi lại.':'Enter a valid email first.';return;}
        if(Date.now()<resendAvailableAt)return;
        resend.disabled=true;
        global.KAS_API.resendVerification(email).then(function(){message.className='kas-auth__message';message.textContent=vi?'Đã gửi mã mới. Vui lòng kiểm tra hộp thư (kể cả thư rác).':'A new code is on its way. Check your inbox, including spam.';startResendCooldown();}).catch(function(error){message.className='kas-auth__message is-error';message.textContent=error.message;resend.disabled=false;});
      };

    }
    /* The server accepts one code per minute; mirror that on the resend button. */
    function startResendCooldown(){resendAvailableAt=Date.now()+60000;updateResend();if(!resendTimer)resendTimer=setInterval(updateResend,1000);}
    function updateResend(){
      var button=m.querySelector('#kasAuthResend');var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';
      var left=Math.ceil((resendAvailableAt-Date.now())/1000);
      if(left<=0&&resendTimer){clearInterval(resendTimer);resendTimer=null;}
      if(!button)return;
      button.disabled=left>0;
      button.textContent=left>0?(vi?'Gửi lại sau ':'Resend in ')+left+'s':(vi?'Gửi lại mã':'Resend code');
    }
    function showVerification(email,password,codeJustSent){
      verificationStage=true;verificationEmail=email;pendingPassword=password||'';
      render();
      if(codeJustSent)startResendCooldown();
    }
    function close(){if(resendTimer){clearInterval(resendTimer);resendTimer=null;}pendingPassword='';m.classList.remove('is-open');setTimeout(function(){m.remove()},180);document.body.style.overflow='';}
    /* After a successful sign-in/join from My KAS, reload that page so its
       booking view is initialized against the newly persisted member session.
       Authentication on other pages keeps the existing no-reload behavior. */
    function finishAuth(delay){
      setTimeout(function(){
        close();
        if (/(^|\/)manage-booking\.html$/i.test(window.location.pathname)) {
          window.location.reload();
        }
      }, delay);
    }
    function submit() {
      var msg = m.querySelector('#kasAuthMessage'), submitButton = m.querySelector('#kasAuthSubmit');
      submitButton.disabled = true;
      if (verificationStage) {
        var enteredCode=String(m.querySelector('#kasAuthCode').value||'').trim();
        var verifyVi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';
        if(!/^\d{6}$/.test(enteredCode)){msg.textContent=verifyVi?'Vui lòng nhập mã gồm 6 chữ số.':'Enter the six-digit code.';submitButton.disabled=false;return;}
        msg.className='kas-auth__message';
        var verifiedEmail=verificationEmail, signInPassword=pendingPassword;
        function signInManually(){
          msg.className='kas-auth__message is-success';
          msg.textContent=verifyVi?'Email đã được xác thực. Vui lòng đăng nhập để tiếp tục.':'Email verified. Please sign in to continue.';
          setTimeout(function(){close();setTimeout(function(){openAuth('login');var field=U.$('#kasAuthEmail');if(field){field.value=verifiedEmail;var pw=U.$('#kasAuthPassword');if(pw)pw.focus();}},40);},900);
        }
        global.KAS_API.verifyEmail(verifiedEmail,enteredCode).then(function(){
          pendingPassword='';
          msg.className='kas-auth__message is-success';
          if(!signInPassword){signInManually();return;}
          msg.textContent=verifyVi?'Email đã được xác thực. Đang đăng nhập…':'Email verified. Signing you in…';
          return global.KAS_API.login(verifiedEmail,signInPassword).then(function(){return global.KAS_API.profile()}).then(function(profile){
            persistSession(sessionFromProfile(profile));
            msg.textContent=verifyVi?'Xác thực thành công. Chào mừng bạn đến với KAS!':'Verified. Welcome to KAS!';
            syncAuthHeader();finishAuth(700);
          }, signInManually);
        }, function(error){msg.className='kas-auth__message is-error';msg.textContent=error.status===400?(verifyVi?'Mã không đúng, đã hết hạn hoặc đã được sử dụng. Kiểm tra lại hoặc gửi lại mã.':'The code is incorrect, expired or already used. Check it or resend a code.'):error.message;submitButton.disabled=false;});
        return;
      }
      if (isForgot) {
        var recoveryEmail = String(m.querySelector('#kasAuthEmail').value || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) { msg.textContent = 'Please enter a valid email address.'; submitButton.disabled = false; return; }
        global.KAS_API.forgotPassword(recoveryEmail).then(function (result) { msg.textContent = result.message; submitButton.disabled = false; })
          .catch(function () { msg.textContent = 'Could not send the reset email. Please try again later.'; submitButton.disabled = false; });
        return;
      }
      if (isReset) {
        var newPassword = String(m.querySelector('#kasAuthPassword').value || '');
        if (newPassword.length < 8) { msg.textContent = 'Use at least 8 characters.'; submitButton.disabled = false; return; }
        global.KAS_API.resetPassword(resetToken, newPassword).then(function () {
          msg.textContent = 'Password updated. Please sign in with your new password.';
          var cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete('resetToken');
          window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
          submitButton.disabled = false;
        })
          .catch(function (error) { msg.textContent = error.message; submitButton.disabled = false; });
        return;
      }
      if (isJoin) {
        var registration = {
          fullName: String(m.querySelector('#kasAuthName').value || '').trim(),
          email: String(m.querySelector('#kasAuthEmail').value || '').trim().toLowerCase(),
          phone: String(m.querySelector('#kasAuthPhone').value || '').trim(),
          country: String(m.querySelector('#kasAuthCountry').value || ''),
          password: String(m.querySelector('#kasAuthPassword').value || ''),
          locale: global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'vi' : 'en'
        };
        if (!registration.fullName || !registration.phone || !registration.country || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email) || registration.password.length < 8) {
          msg.textContent = 'Please complete all fields. Use a valid email and a password with at least 8 characters.';
          submitButton.disabled = false; return;
        }
        if (!global.KAS_API) { msg.textContent = 'KAS API is not configured.'; submitButton.disabled = false; return; }
        global.KAS_API.register(registration).then(function () {
          var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';
          showVerification(registration.email, registration.password, true);
          m.querySelector('#kasAuthMessage').textContent=vi?'Đã tạo tài khoản. Mã xác thực đang được gửi tới email, có thể mất một phút.':'Account created. Your code is on its way and may take a minute.';
          m.querySelector('#kasAuthCode').focus();
        }).catch(function (error) { var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi'; msg.textContent = error.payload && (error.payload.code==='ACCOUNT_ALREADY_EXISTS'||(error.payload.details||[]).some(function(x){return x.code==='ACCOUNT_ALREADY_EXISTS';})) ? (vi?'Email này đã tồn tại. Vui lòng đăng nhập hoặc dùng email khác.':'This email is already registered. Sign in or use another email.') : error.message; submitButton.disabled = false; });
        return;
      }
      var emailLogin=String(m.querySelector('#kasAuthEmail').value||'').trim().toLowerCase();
      var password=String(m.querySelector('#kasAuthPassword').value||'');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLogin) || !password){var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';msg.textContent=vi?'Vui lòng nhập email hợp lệ và mật khẩu.':'Please enter a valid email and password.';submitButton.disabled=false;return}
      if (!global.KAS_API) { msg.textContent = 'KAS API is not configured.'; submitButton.disabled = false; return; }
      global.KAS_API.login(emailLogin,password).then(function(){return global.KAS_API.profile()}).then(function(profile){
        persistSession(sessionFromProfile(profile));
        msg.textContent='Signed in successfully.';syncAuthHeader();finishAuth(400);
      }).catch(function(error){if(error.status===404){/* Signed in, but not a customer: a staff account. */resolveStaffSession(emailLogin).then(function(staff){var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';if(!staff){msg.textContent=vi?'Tài khoản này không có hồ sơ khách hàng.':'This account has no guest profile.';submitButton.disabled=false;return;}persistSession(staff);msg.textContent=vi?'Đã đăng nhập. Mở "Trang quản trị" trong menu tài khoản.':'Signed in. Open "Trang quản trị" from the account menu.';syncAuthHeader();finishAuth(900);});return;}var needsVerification=error.payload && (error.payload.details || []).some(function(item){return item.code==='EMAIL_NOT_VERIFIED';});var vi=global.KAS_I18N && global.KAS_I18N.getLanguage()==='vi';if(needsVerification){showVerification(emailLogin,password,false);m.querySelector('#kasAuthMessage').textContent=vi?'Email chưa được xác thực. Nhập mã đã gửi sau khi đăng ký, hoặc bấm gửi lại mã.':'Your email is not verified yet. Enter the code sent after registration, or resend a code.';m.querySelector('#kasAuthCode').focus();return;}msg.textContent=error.message;submitButton.disabled=false;});
    }
    document.body.appendChild(m); document.body.style.overflow='hidden';
    closeOnBackdropPress(m, close);
    render();
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
    closeOnBackdropPress(m, close);
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
    syncAuthHeader();
    U.$$('.js-kas-auth').forEach(function(b){
      if(b.__kasAuthBound)return;b.__kasAuthBound=true;
      b.addEventListener('click',function(){openAuth('login')});
    });
  }

  /* ---------------- boot ---------------- */
  function boot(opts) {
    opts = opts || {};
    renderHeader(opts);
    bindAuthButtons();
    hydrateMemberSession();
    if (opts.footer === 'v3') renderFooterV3(); else renderFooter();
    renderFloat();
    reveal();
    if (global.KAS_I18N) global.KAS_I18N.init();
    if (!opts.noWelcome) openWelcome();
  }

  /* ---------------- saved hotels: one behaviour for every heart ----------------
     Any element with data-save-hotel="<hotel id>" is a save toggle — listing
     cards, the hotel page and Find Your KAS (hotels only — rooms are not saved). One delegated click
     handler and one painter keep them identical and in step: a change made by
     any of them (or in another part of the page) repaints all of them.
     data-save-text="hotel" adds a visible label; otherwise the
     button is an icon with an accessible name. */
  var SAVE_COPY = {
    vi: { hotel: ['Lưu khách sạn', 'Đã lưu'], aria: ['Lưu khách sạn', 'Bỏ lưu khách sạn'] },
    en: { hotel: ['Save hotel', 'Saved'], aria: ['Save hotel', 'Remove from Saved'] }
  };
  function paintSaveButtons(root) {
    if (!global.Store || !global.Store.isHotelSaved) return;
    var copy = SAVE_COPY[global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'vi' : 'en'];
    U.$$('[data-save-hotel]', root || document).forEach(function (btn) {
      var saved = global.Store.isHotelSaved(btn.getAttribute('data-save-hotel'));
      btn.classList.toggle('is-saved', saved);
      btn.setAttribute('aria-pressed', String(saved));
      btn.setAttribute('aria-label', copy.aria[saved ? 1 : 0]);
      btn.setAttribute('title', copy.aria[saved ? 1 : 0]);
      var mode = btn.getAttribute('data-save-text');
      if (mode && copy[mode]) {
        var label = U.$('[data-save-label]', btn);
        if (!label) { btn.innerHTML = U.icon('heart', 15) + '<span data-save-label></span>'; label = U.$('[data-save-label]', btn); }
        label.textContent = copy[mode][saved ? 1 : 0];
      }
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-save-hotel]') : null;
    if (!btn || !global.Store || !global.Store.toggleSavedHotel) return;
    e.preventDefault();
    e.stopPropagation();
    var saved = global.Store.toggleSavedHotel(btn.getAttribute('data-save-hotel'));
    if (saved === null) return; /* signing in first; the save finishes afterwards */
    var vi = global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi';
    U.toast(saved ? (vi ? 'Đã lưu vào My KAS.' : 'Saved to My KAS.') : (vi ? 'Đã bỏ lưu.' : 'Removed from Saved.'));
  }, true);
  global.addEventListener('kas:saved-hotels-changed', function () { paintSaveButtons(); });
  document.addEventListener('kas:language', function () { paintSaveButtons(); });

  global.flagIcon = flagIcon;

  global.App = {
    boot: boot, logo: logo, logoMark: logoMark, flagIcon: flagIcon,
    renderSteps: renderSteps, gallery: gallery, openLightbox: openLightbox,
    miniHTML: miniHTML, miniCarousel: miniCarousel,
    modal: modal, amenityIcon: amenityIcon, reveal: reveal,
    openAuth: openAuth, paintSaveButtons: paintSaveButtons,
    openDrawer: openDrawer, closeDrawer: closeDrawer
  };
})(window);
