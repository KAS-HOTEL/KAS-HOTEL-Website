

## V22.4 — Balanced Collection Cards
- Equal-height editorial cards on the homepage collection section.
- Lead card remains wider, but no longer taller than the adjacent cards.
- Reduced section vertical padding for a tighter composition.
- Strengthened image gradient and text shadow for consistent title readability.
# KAS Hotel Collection — Version 22.0.0

- Local development starts without manually setting ADMIN_KEY.
- When local ADMIN_KEY is absent, the server binds to loopback and admin routes are available only from localhost.
- Production/Render still requires a real ADMIN_KEY environment variable.
- package.json and package-lock.json use version 22.0.0.
- node_modules is not part of the release archive.


## V22.14 — Four Neighbourhood Stories
Replaced the homepage KAS experience feature grid with the four-tile City Guide section, matching the supplied KAS City Guide reference.
## V22.15 — City Guidebook Bilingual Markup Fix
- Preserved the supplied V22 City Guidebook bilingual content and visual system.
- Fixed malformed anchor attributes in the City Guide and After Dark EN/VI pages that could prevent the A O Show / Lune Production, Saigon Centre / Takashimaya, and Gia Long Palace / City Museum cards from behaving correctly.
- Kept the existing bilingual guidebook structure and links intact.
