# KAS V21.6 — Centered 3-Column Layout

- Homepage uses a stable three-column page frame: flexible left gutter / bounded 1180px content rail / flexible right gutter.
- Hero background remains full viewport width and full viewport height; hero copy stays centered inside the bounded rail.
- Homepage editorial sections use the same centered rail instead of expanding with viewport width.
- Footer content uses the same centered 1180px rail across the project.
- No `transform: scale()`, CSS `zoom`, or JavaScript page scaling was added.
- Responsive behavior collapses the side gutters and stacks existing grids at narrow widths.
- Existing header/hero scroll behavior and page functionality are preserved.
