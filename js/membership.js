/* KAS Membership page (offers.html).
   - The call to action follows the member's sign-in state. js/app.js owns the session and
     announces every change with `kas:member-changed`; before that first event, the non-secret
     sign-in hint it keeps decides the starting state.
   - "Join" opens the site's existing sign-up dialog (App.openAuth('join')); without it the
     link still leads to My KAS, where guests sign in or join. */
(function (global) {
  'use strict';
  function show(signedIn) {
    var blocks = document.querySelectorAll('[data-mship-cta]');
    for (var i = 0; i < blocks.length; i++) {
      var forMember = blocks[i].getAttribute('data-mship-cta') === 'member';
      blocks[i].hidden = forMember ? !signedIn : signedIn;
    }
  }
  var hint = null;
  try { hint = global.localStorage.getItem('kas_session_hint'); } catch { /* storage blocked */ }
  show(hint === '1');
  global.addEventListener('kas:member-changed', function (event) {
    show(!!(event.detail && event.detail.signedIn));
  });

  var joins = document.querySelectorAll('[data-mship-join]');
  for (var j = 0; j < joins.length; j++) {
    joins[j].addEventListener('click', function (event) {
      if (global.App && typeof global.App.openAuth === 'function') {
        event.preventDefault();
        global.App.openAuth('join');
      }
    });
  }
})(window);
