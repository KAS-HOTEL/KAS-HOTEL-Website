# KAS V20.8 — Index Grid / Resize Stabilization

- Homepage uses bounded CSS Grid layouts and discrete responsive breakpoints.
- No global `transform: scale()`, `zoom`, or JavaScript page scaling.
- Hero remains full-screen.
- Shared Booking Search Bar is rendered directly below the hero.
- Desktop editorial sections use 12-column grids.
- Wide CSS viewports created by browser zoom-out use explicit breakpoints at 1800px and 2400px instead of continuous viewport scaling.
- Tablet/mobile layouts reflow by grid breakpoints.
- Existing header transparent → black scroll logic is preserved.
