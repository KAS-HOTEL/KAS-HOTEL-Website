# KAS Hotel Collection V2 — Guest browsing flow

## What changed

1. `index.html` keeps the existing KAS home search flow. Select a hotel + dates and press Search.
2. `hotel-detail.html` now waits for `/api/catalog` and overlays uploaded room photos onto the correct room type using the operator mapping `hotel + STT + Ez`.
3. Room cards now calculate the selected check-in nightly rate from `js/rates.js` and show the selected stay total without VAT/service charge.
4. `room-detail.html` now:
   - shows the uploaded photos for that exact room type;
   - lets the guest view all uploaded photos using the existing carousel + lightbox;
   - shows the room amenities already defined for that room type;
   - uses the operator rate sheet for the selected dates;
   - does not add VAT or service charge;
   - changes “Book this room” into an informational message with Zalo 0869 768 885.
5. `js/live.js` is the bridge between the persistent admin upload catalog and the normal KAS frontend.

## Important: preserve uploaded photos

Your already-uploaded photos live in `uploads/` plus `uploads/manifest.json` on the machine where the KAS Node server is running.

When installing this V2 over the working project, do not delete `uploads/`.
Simply extract the ZIP over the current project and allow the new code files to overwrite the old ones.
The ZIP intentionally contains no fake room photos.

## Run

```bash
npm install
npm start
```

Guest:
- http://localhost:3000/index.html

Admin:
- http://localhost:3000/admin
