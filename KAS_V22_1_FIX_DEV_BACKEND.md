# KAS V22.1 — Fix Admin image update startup

## Fix
- `npm run dev` now executes `node server.js` instead of a static-only `serve` process.
- This ensures Admin image URL/upload actions have the Express `/api/admin/*` routes available.

## Run
1. `npm install`
2. `npm run dev` (or `node server.js`)
3. Open `http://localhost:3000/admin.html`

Do not use a static-only preview server for Admin mutations.

## Scope
Only the `package.json` dev script was changed; the rest of the V22 files and data are preserved.

## Validation
JavaScript syntax and JSON parse checks pass. ZIP integrity is checked. Browser/API mutation test is not claimed because dependencies are not installed in this validation environment.
