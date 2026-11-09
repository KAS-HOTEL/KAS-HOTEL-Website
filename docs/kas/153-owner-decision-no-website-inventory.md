# Owner decision — no room stock on the website

Approved by the project owner in the project chat on 24 October 2026.

The website does not maintain or receive room stock. Hotel administrators check
availability manually outside the website. This supersedes earlier inventory,
hold, buffer, automated availability and reconciliation requirements, including
the inventory portions of documents 15, 55, 58, 117 and 152.

- No stock calendars, stock editing, buffers, stock counters, sold-out badges or
  automated availability checks in customer, partner or admin experiences.
- Published room descriptions, occupancy, requested room quantity and rate
  estimates remain. These are not room stock. Selecting dates or requesting
  multiple rooms does not assert that those rooms are available.
- Requests, quotes, manual hotel approval, payment verification, confirmation,
  cancellation and decline never read, reserve, increment, decrement or release
  room stock. A cancellation must not require an inventory hold.
- Only hotel staff's explicit review determines whether a request can proceed.
  Guest payment reports do not confirm money received or confirm a stay.
- Inventory APIs and expiry jobs are retired. Old URLs must not serve counts or
  accept stock mutations. Historical database migrations/data are preserved;
  this decision does not authorize destructive database cleanup.
- Active pricing reads use `/api/v1/public/request-pricing`; responses contain
  room identity and prices, never stock quantities or availability booleans.

Historical stock classes/schema may remain for source/test compatibility, but
they must have no registered HTTP or scheduled entry point and must not be
called from active booking flows. Their physical/schema removal is separate
cleanup; do not restore them to satisfy obsolete inventory tests or documents.
