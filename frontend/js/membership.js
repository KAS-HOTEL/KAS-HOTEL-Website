/* KAS Membership page (offers.html), as in the approved demo
   KAS_Membership_Interactive_2026_v2_UPDATED.html:
   - FAQ: native <details>; opening one question closes the others.
   - "Show all answers" opens every question and "Collapse all" closes them; they stay that way
     until the guest clicks a question, which brings back one-at-a-time. */
(function () {
  'use strict';
  var entries = Array.prototype.slice.call(document.querySelectorAll('#faq .ms-faq-list details'));
  if (!entries.length) return;
  var batch = false;

  entries.forEach(function (detail) {
    var summary = detail.querySelector('summary');
    if (summary) summary.addEventListener('click', function () { batch = false; });
    detail.addEventListener('toggle', function () {
      if (batch || !detail.open) return;
      entries.forEach(function (other) { if (other !== detail && other.open) other.open = false; });
    });
  });

  function setAll(open) {
    batch = true;
    entries.forEach(function (item) { item.open = open; });
  }
  var expand = document.getElementById('expand-faq');
  var collapse = document.getElementById('collapse-faq');
  if (expand) expand.addEventListener('click', function () { setAll(true); });
  if (collapse) collapse.addEventListener('click', function () { setAll(false); });
})();
