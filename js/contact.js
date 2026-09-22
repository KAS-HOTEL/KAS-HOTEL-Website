/* =========================================================================
   KAS — CONTACT
   =========================================================================
   Every phone number, Zalo link and WhatsApp link in the application is
   rendered by this module, from KAS_DATA.config.contact. Nothing is
   hard-coded in a component.

   Official contact:
     phone     0869 768 885   ->  tel:+84869768885
     Zalo      https://zalo.me/0869768885
     WhatsApp  https://wa.me/84869768885
   ========================================================================= */

(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA;
  var C = D.config.contact;

  /* ---------- primitives ---------- */

  /** Clickable phone link. `style` = 'plain' | 'button' | 'inverse' */
  function phoneLink(style, label) {
    var txt = label || C.displayPhone;
    if (style === 'button') {
      return '<a class="btn btn--ghost btn--sm ct-btn" href="' + C.tel + '">' +
        U.icon('phone', 14) + ' ' + U.esc(txt) + '</a>';
    }
    if (style === 'inverse') {
      return '<a class="ct-link ct-link--inv" href="' + C.tel + '">' +
        U.icon('phone', 15) + '<span>' + U.esc(txt) + '</span></a>';
    }
    return '<a class="ct-link" href="' + C.tel + '">' +
      U.icon('phone', 15) + '<span>' + U.esc(txt) + '</span></a>';
  }

  function zaloLink(style, label) {
    return channel('zalo', C.zalo, label || 'Chat on Zalo', style);
  }
  function whatsappLink(style, label) {
    return channel('whatsapp', C.whatsapp, label || 'Chat on WhatsApp', style);
  }

  function channel(kind, href, label, style) {
    var ic = kind === 'zalo' ? 'chat' : 'phone';
    var cls = 'ct-' + kind;
    if (style === 'button') {
      return '<a class="btn btn--ghost btn--sm ct-btn ' + cls + '" href="' + href +
        '" target="_blank" rel="noopener">' + U.icon(ic, 14) + ' ' + U.esc(label) + '</a>';
    }
    if (style === 'inverse') {
      return '<a class="ct-link ct-link--inv ' + cls + '" href="' + href +
        '" target="_blank" rel="noopener">' + U.icon(ic, 15) + '<span>' + U.esc(label) + '</span></a>';
    }
    return '<a class="ct-link ' + cls + '" href="' + href +
      '" target="_blank" rel="noopener">' + U.icon(ic, 15) + '<span>' + U.esc(label) + '</span></a>';
  }

  function emailLink(style) {
    if (style === 'inverse') {
      return '<a class="ct-link ct-link--inv" href="mailto:' + C.email + '">' +
        U.icon('mail', 15) + '<span>' + U.esc(C.email) + '</span></a>';
    }
    return '<a class="ct-link" href="mailto:' + C.email + '">' +
      U.icon('mail', 15) + '<span>' + U.esc(C.email) + '</span></a>';
  }

  /* ---------- composed blocks ---------- */

  /** Compact row for the site header. */
  function headerBlock() {
    return '<a class="hdr__tel" href="' + C.tel + '" aria-label="Call KAS on ' +
      C.displayPhone + '">' + U.icon('phone', 15) +
      '<span>' + U.esc(C.displayPhone) + '</span></a>';
  }

  /** Three-channel support block — used in booking sidebars and panels. */
  function supportBlock(opts) {
    opts = opts || {};
    var title = opts.title || 'Need help with your booking?';
    var sub = opts.sub || 'Our KAS team is here for you ' + C.hours + '.';
    return '<div class="ct-support' + (opts.inverse ? ' ct-support--inv' : '') + '">' +
woven(title, sub) +
      '<div class="ct-channels">' +
        '<a class="ct-ch ct-ch--call" href="' + C.tel + '">' + U.icon('phone', 16) +
          '<span><b>' + U.esc(C.displayPhone) + '</b><small>Call us</small></span></a>' +
        '<a class="ct-ch ct-ch--zalo" href="' + C.zalo + '" target="_blank" rel="noopener">' +
          U.icon('chat', 16) + '<span><b>Zalo</b><small>Chat with us</small></span></a>' +
        '<a class="ct-ch ct-ch--wa" href="' + C.whatsapp + '" target="_blank" rel="noopener">' +
          U.icon('chat', 16) + '<span><b>WhatsApp</b><small>Chat with us</small></span></a>' +
      '</div></div>';

    function woven(t, s) {
      return '<div class="ct-support__hd">' + U.icon('help', 18) +
        '<div><b>' + U.esc(t) + '</b><span>' + U.esc(s) + '</span></div></div>';
    }
  }

  /** Footer contact column. */
  function footerBlock() {
    return '<h5>Contact &amp; support</h5>' +
      '<div class="ct-stack ct-stack--footer">' +
        phoneLink('plain') +
        zaloLink('plain') +
        whatsappLink('plain') +
        emailLink('plain') +
      '</div>';
  }

  /* ---------- floating widget ----------
     Replaces the old single "Chat with us" bubble. Collapsed it is one small
     button; expanded it offers Call / Zalo / WhatsApp. It sits clear of the
     mobile sticky CTA (see .has-mcta rules in responsive.css) so it never
     covers a price or the Book button. */
  function floatingWidget() {
    if (U.$('#ctFab')) return;

    var wrap = U.el('div', { class: 'ct-fab noprint', id: 'ctFab' });
    wrap.innerHTML =
      '<div class="ct-fab__menu" id="ctFabMenu" hidden>' +
        '<a class="ct-fab__item" href="' + C.tel + '">' + U.icon('phone', 16) +
          '<span><b>' + U.esc(C.displayPhone) + '</b><small>Call us</small></span></a>' +
        '<a class="ct-fab__item" href="' + C.zalo + '" target="_blank" rel="noopener">' +
          U.icon('chat', 16) + '<span><b>Zalo</b><small>Quick support</small></span></a>' +
        '<a class="ct-fab__item" href="' + C.whatsapp + '" target="_blank" rel="noopener">' +
          U.icon('chat', 16) + '<span><b>WhatsApp</b><small>Message us</small></span></a>' +
      '</div>' +
      '<button class="ct-fab__btn" type="button" id="ctFabBtn" aria-expanded="false" ' +
        'aria-controls="ctFabMenu" aria-label="Contact KAS">' +
        U.icon('chat', 17) + '<span class="ct-fab__label">Contact us</span>' +
      '</button>';
    document.body.appendChild(wrap);

    var btn = U.$('#ctFabBtn', wrap), menu = U.$('#ctFabMenu', wrap);
    function setOpen(open) {
      menu.hidden = !open;
      wrap.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  global.Contact = {
    config: C,
    phoneLink: phoneLink, zaloLink: zaloLink, whatsappLink: whatsappLink,
    emailLink: emailLink, headerBlock: headerBlock, supportBlock: supportBlock,
    footerBlock: footerBlock, floatingWidget: floatingWidget
  };
})(window);
