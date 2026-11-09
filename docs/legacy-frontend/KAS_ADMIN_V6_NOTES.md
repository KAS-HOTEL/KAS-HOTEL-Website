# KAS Admin V6 — Property gallery upload

## New behavior
- `Ảnh KAS Collection`: 1 separate cover image for the card on the home page.
- `Ảnh bên trong khách sạn`: upload multiple gallery images per hotel/branch.
- When a branch has a custom property gallery, the hotel detail page uses those uploaded images instead of the old static property gallery.
- Cover and property gallery are stored separately and persist on the Render Persistent Disk.
- Property gallery images can be individually deleted from Admin.

## Important
- Room-image uploads remain unchanged and still map to each room STT.
- Do NOT commit or upload the `uploads/` folder to Git.
- Existing Collection cover image is preserved when adding property gallery images.
- Removing the Collection cover does not delete the property gallery.

## Local test
```bat
cd /d "C:\kas-hotels (2)"
npm start
```
Then open:
- http://localhost:3000/admin
- http://localhost:3000/index.html

## Git after testing
Use `git add -u` and inspect `git status`. Do not use `git add .` because `uploads/` is intentionally untracked.

## V7 — Property gallery on hotel listing
The hotel listing page (`hotels.html`) now loads the live catalog and overlays each hotel's admin-uploaded property gallery before repainting hotel cards. This means the outside hotel cards show the same property photos configured in Admin that appear inside `hotel-detail.html`. Static hotel photos remain the fallback when no property gallery has been uploaded.
