# KAS V21 — Homepage 3-column centered layout

The homepage now follows the same centered-container principle as `hotels.html`:

- outer CSS Grid has 3 columns;
- left and right columns are flexible gutters;
- the homepage content occupies the center column with a 1440px maximum;
- the center column is the only column containing the homepage sections;
- typography is bounded with rem/clamp values rather than continuous full-page scaling;
- no `transform: scale()` or CSS `zoom`;
- mobile collapses to one content column;
- header/footer remain outside the content frame;
- existing homepage content, bilingual layer, booking search bar, and header scroll logic are preserved.
