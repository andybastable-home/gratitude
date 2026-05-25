# Phase 2 — design decisions (archived)

Phase 2 (style guide) is **done**. The canonical visual spec is **`notes/style-guide.html`**
(open it in a browser). This note keeps the *rationale* behind the locked choices so Phase 3
(and future tweaks) understand the "why", not just the "what". Older iterations
(`font-specimen{,-2,-3,-4}.html`, `day-view-mockup{,-2,-3,-4}.html`, `add-entry-mockup.html`)
are retained for history.

## Identity
- **Distinctiveness = seasonality.** Plants is static green, food-and-weight static blue;
  Gratitude is the one that changes with the year — that rotation is its signature.
- **Full-personality seasonal shifts:** accent + radial wash + a painterly hero per mini-season.
  Paper stays warm cream **all year** (even Winter) so it never reads as "the blue app".
- **Dark mode: NONE.** Light-only, by choice (2026-05-25) — the warm-paper journal feel is the
  identity, and it lets the `multiply`-blend watercolour heroes just work.

## Six mini-seasons & accents (UK)
Spring (Mar–Apr) narcissus green-gold `hsl(82 45% 40%)`; Early Summer (May–Jun) blossom rose
`hsl(345 55% 52%)`; Late Summer (Jul–Sep) sun-gold `hsl(38 70% 46%)`; Autumn (Oct–Nov) russet
`hsl(20 65% 45%)`; Advent (Dec) liturgical violet `hsl(270 35% 45%)` + candle-gold; Winter
(Jan–Feb) frost slate-periwinkle `hsl(210 30% 48%)`, kept desaturated. Exact theme tokens
(accent/accent-deep/ink/paper/card/wash) live in `style-guide.html`.

## Type & brand
- **Caveat** (handwriting, OFL) — wordmark, day dates, category headings, timestamps.
  **Figtree** (humanist sans, OFL) — entry/body text, labels, buttons. Andy rejected Caveat
  as body text; Figtree won the body round. Both **vendored** as variable woff2 in
  `assets/fonts/` (`fonts.css`).
- **Brand mark = the outline heart** from the original `index.html` banner (`<path d="M12
  20s-7-4.35-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 0c0 5.15-7 9.5-7 9.5z"/>`), NOT the
  placeholder PWA icon. Reuse this exact heart.

## Categories (fixed colours across all seasons)
wife→**Bella** `hsl(348 54% 52%)`, family `hsl(32 62% 47%)`, nature `hsl(134 34% 38%)`,
me `hsl(202 30% 45%)`, god `hsl(265 32% 52%)`. Each has a line-icon; **God = a simple cross.**
Category heading is **Caveat, inked in the category colour** (not graphite).

## Day-view
Entries **grouped by category**, chronological within a group; warm ink (not black). Season
accent drives the date + FAB; per-category colour drives headings + card hatch. **Floating +
FAB bottom-right** (one-handed thumb reach) — it floats over the scroll, never scrolls away;
a `screen-fade` gradient sits above it. Paper grain + seasonal radial wash; staggered load.
Per-category counts **removed**. **Settings gear** sits on a frosted paper disc (`color-mix`
paper bg + blur + shadow) so it lifts off the busy hero.

## Hand-drawn crayon entry card
Crayon **hatch fill** in the category colour (layered `repeating-linear-gradient`) + a wobbly
**double outline** via `feTurbulence`+`feDisplacementMap` (`#sketch1/2/3`, three seeds + tiny
rotations `.s1/.s2/.s3` so neighbours differ); only the border is filtered so text stays crisp.
A soft inset "eraser" glow keeps the hatch dense in the middle and fades it at the edges. Card
text gets a paper-coloured text-shadow halo for legibility over the texture. No left accent bar.

## Hero watercolours
Bespoke painterly JPG per season, motif clustered **top-right**, left ~45% empty for the date.
`mix-blend-mode: multiply` drops the cream bg into the app paper; `background-position: top
right`; masked fade to transparent at the bottom. All six in **`assets/heroes/`** — Gemini
masters converted with ffmpeg to a uniform **1000×640, JPG q3, 70–102 KB** (crop keeps the
right/motif, trims empty-left). Gemini PNG masters (`notes/*_Gemini.png`) are git-ignored.
Minor: Early Summer's paper is a touch cooler than the rest, but multiply normalises it.

## Add-entry = full-screen compose
The + FAB opens a calm full-screen page (hero overhead, Caveat prompt "What are you grateful
for?", borderless journal text field, category **chips**, primary **"Add to today"** button
pinned bottom in thumb reach, disabled until there's content). Chosen over a quick bottom sheet
for the reflective journal feel. **Selected chip = the entry card's crayon treatment** scaled
down (displacement scale 4/3.5 vs the cards' 6/5; `#chip1/2`) so choosing a category "inks it in."

## Timestamp
Faint right-aligned **Caveat** scribble, almost hidden — playful, optional-feeling.
