# Header / Hero navigation cleanup

The homepage header is fixed over the hero. `js/app.js` toggles `header--transparent` at the top and `header--scrolled` after 8px of scroll. Header background/state CSS now has one owner: `css/style.css`. The later `!important` background rule and duplicate homepage header state in `css/components.css` were removed. The scrolled state is near-black (`#0d0d0d`). No viewport-height change was made in this header fix.
