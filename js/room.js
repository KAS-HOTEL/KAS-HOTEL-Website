/* ==========================================================================
   KAS — ROOM DETAIL helpers (specs, amenities, policies, reviews)
   ========================================================================== */
(function (global) {
  'use strict';
  var U = global.U, App = global.App;

  /* ---------- spec strip ---------- */
  function specStripHTML(h, r) {
    var items = [
      ['size',   r.size || 'Not published', 'Room size'],
      ['bed',    r.bedType,                 'Bed type'],
      ['view',   r.view || 'Not published', 'View'],
      ['users',  r.maxGuests + ' guest' + (r.maxGuests === 1 ? '' : 's'), 'Max occupancy'],
      ['home',   r.window || 'Not published', 'Window'],
      ['bath',   r.bathroom || 'Not published', 'Bathroom'],
    ];
    return '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:16px;padding:20px 0;border-block:1px solid var(--line)" class="specstrip">' +
      items.map(function (i) {
        return '<div style="display:flex;gap:9px;align-items:flex-start;min-width:0">' +
          '<span style="color:var(--gold-dk);flex-shrink:0;margin-top:1px">' + U.icon(i[0], 17) + '</span>' +
          '<div style="min-width:0"><b style="font-size:.83rem;display:block;line-height:1.35">' + U.esc(i[1]) + '</b>' +
          '<span class="tiny muted">' + i[2] + '</span></div></div>';
      }).join('') + '</div>';
  }

  /* ---------- policies ---------- */
  function policiesHTML(h, r, checkIn) {
    var rows = [
      ['Check-in',     h.checkIn, 'Photo ID or passport required.'],
      ['Check-out',    h.checkOut, 'Late check-out on request.'],
      ['Cancellation', 'Free until ' + U.cancelBy(checkIn), 'After that, 1 night is charged.'],
      ['Children',     'All ages welcome', 'Extra bed on request, subject to availability.'],
      ['Payment',      r.payment, 'No payment is taken in this demo.'],
      ['Smoking',      'Non-smoking room', 'Smoking is not permitted indoors.']
    ];
    return '<div class="dl dl--2" style="gap:18px 26px">' +
      rows.map(function (x) {
        return '<div><div class="dt">' + x[0] + '</div><div class="dd">' + U.esc(x[1]) +
          '<small>' + U.esc(x[2]) + '</small></div></div>';
      }).join('') + '</div>';
  }

  /* ---------- reviews block ---------- */
  function reviewsHTML(h) {
    var revs = h.guestReviews || [];
    var subs = h.subRatings;
    // Distribution derived from the property's published average + volume.
    var dist = distribution(h.rating, h.reviews);

    return '<div class="between" style="margin-bottom:22px;flex-wrap:wrap">' +
        '<div><h2 style="font-size:1.5rem">Guest reviews</h2>' +
        '<p class="tiny muted" style="margin:3px 0 0">Verified reviews from ' + U.esc(h.ratingSource) +
        '' +
        '</p></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:300px 1fr;gap:26px;align-items:start" class="revgrid">' +
        '<div class="card">' +
          '<div style="text-align:center;padding-bottom:16px;border-bottom:1px solid var(--line)">' +
            '<div style="font-family:var(--serif);font-size:3rem;line-height:1;color:var(--tx)">' + h.rating.toFixed(1) +
              '<span style="font-size:1.1rem;color:var(--tx-3)">/10</span></div>' +
            '<div style="color:var(--gold);margin:9px 0 5px;display:flex;justify-content:center">' + U.stars(h.rating / 2, 15) + '</div>' +
            '<div class="tiny muted">Based on ' + h.reviews + ' reviews</div>' +
          '</div>' +
          '<div style="padding-top:16px;display:flex;flex-direction:column;gap:7px">' +
            dist.map(function (d) {
              return '<div class="revbar"><span>' + d.s + ' star' + (d.s === 1 ? '' : 's') + '</span>' +
                '<span class="revbar__t"><span class="revbar__f" style="width:' + d.pct + '%"></span></span>' +
                '<span style="text-align:right">' + d.n + '</span></div>';
            }).join('') +
          '</div>' +
          (subs ? '<div class="divider"></div>' +
            Object.keys(subs).map(function (k) {
              return '<div class="revbar" style="grid-template-columns:78px 1fr 30px;margin-bottom:6px">' +
                '<span>' + k + '</span>' +
                '<span class="revbar__t"><span class="revbar__f" style="width:' + (subs[k] / 5 * 100) + '%"></span></span>' +
                '<span style="text-align:right">' + subs[k].toFixed(1) + '</span></div>';
            }).join('') : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px" class="revlist">' +
          (revs.length ? revs.map(function (r) {
            return '<div class="revcard">' +
              '<div class="revcard__hd"><span class="avatar">' + U.initials(r.name) + '</span>' +
                '<div style="min-width:0"><b style="font-size:.85rem;display:block">' + U.esc(r.name) + '</b>' +
                '<span class="tiny muted">' + 'Stayed ' + U.esc(r.date) + '</span></div>' +
                '<span style="margin-left:auto;color:var(--gold)">' + U.stars(r.stars, 12) + '</span></div>' +
              '<p style="font-size:.86rem;line-height:1.65;margin:0">“' + U.esc(r.text) + '”</p></div>';
          }).join('') :
            '<p class="muted">Individual review text is not available from source for this property.</p>') +
        '</div>' +
      '</div>';
  }

  /** Plausible 1–5 star split reconstructed from the published mean + count. */
  function distribution(avg, total) {
    var w = [0, 0, 0, 0, 0];
    // weight mass around the mean
    for (var s = 1; s <= 5; s++) {
      var d = Math.abs(s - avg);
      w[s - 1] = Math.exp(-(d * d) / 0.42);
    }
    var sum = w.reduce(function (a, b) { return a + b; }, 0);
    var counts = w.map(function (x) { return Math.round(x / sum * total); });
    var diff = total - counts.reduce(function (a, b) { return a + b; }, 0);
    counts[Math.round(avg) - 1] += diff;
    var max = Math.max.apply(null, counts) || 1;
    var out = [];
    for (var i = 5; i >= 1; i--) {
      out.push({ s: i, n: Math.max(0, counts[i - 1]), pct: Math.max(0, counts[i - 1]) / max * 100 });
    }
    return out;
  }

  global.RoomUI = {
    specStripHTML: specStripHTML, policiesHTML: policiesHTML,
    reviewsHTML: reviewsHTML, distribution: distribution
  };
})(window);
