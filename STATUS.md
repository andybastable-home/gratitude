# STATUS

## Current phase

**Phase 2 — Style guide** (next)

Phase 1 (bootstrap + OAuth/Sheets sync) is **done** at v0.1.0: installable PWA shell, Dexie
store, and uuid-keyed merge sync to a Google Sheet across two clients. The UI is a scrappy
dev harness (a plain text input + list) — intentionally ugly; Phases 2/3 own the look and
Phase 4 replaces the harness with the real logging UX.

## Manual setup Andy must do before sync works on-device

These are one-time Google Cloud Console / GitHub steps for OAuth client
`58841586776-24iml4d2gnq5saou92483707bq3ar80l`:

1. **Authorized JavaScript origins:** add `https://andybastable-home.github.io` and
   `http://localhost:8000`.
2. **OAuth consent screen → Test users:** add `andy.bastable@gmail.com`.
3. **APIs enabled:** Google Sheets API + Google Drive API (likely already on — same project
   as food-and-weight).
4. **GitHub Pages:** enable on the `gratitude` repo (main branch, root) →
   `https://andybastable-home.github.io/gratitude/`.

Until 1–2 are done, the Connect button will fail with an OAuth origin/consent error.

## Phase 2 design decisions (locked so far)

- **Distinctiveness = seasonality.** Plants is static green, food-and-weight static blue;
  Gratitude is the one that changes with the year. That rotation is its signature.
- **Season-tinted canvas** — the whole background (not just the accent) shifts hue per
  mini-season. **Full-personality** shifts: accent + wash + a small per-season motif/texture.
- **Six mini-seasons & accents** (UK northern-hemisphere): Spring (Mar–Apr) narcissus
  green-gold `hsl(82 45% 40%)`; Early Summer (May–Jun) blossom rose `hsl(345 55% 52%)`;
  Late Summer (Jul–Sep) sun-gold `hsl(38 70% 46%)`; Autumn (Oct–Nov) russet `hsl(20 65% 45%)`;
  Advent (Dec) liturgical violet `hsl(270 35% 45%)` + candle-gold; Winter (Jan–Feb) frost
  slate-periwinkle `hsl(210 30% 48%)`, kept desaturated so it never reads as "the blue app".
- **Categories:** wife / family / nature / me / God. Line-icon + muted per-category dot
  (season leads). **God glyph = simple cross.** Brand mark = heart (Andy likes it).
- **Fonts LOCKED: Caveat** (handwriting) for wordmark + date headings; **Figtree** for
  body. Both OFL / self-hostable. Andy didn't like Caveat as body text. Specimens
  `notes/font-specimen{,-2,-3,-4}.html` retained for history.
- **Brand mark LOCKED: the outline heart already in `index.html` banner** (`<path d="M12
  20s-7-4.35-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 0c0 5.15-7 9.5-7 9.5z"/>`), NOT the
  placeholder PWA icon. Reuse this exact heart.
- **Category sub-headings LOCKED: Caveat** (option A), inked in each category's own muted
  colour. Category colours (fixed across seasons): wife `hsl(348 54% 52%)`, family
  `hsl(32 62% 47%)`, nature `hsl(134 34% 38%)`, me `hsl(202 30% 45%)`, god `hsl(265 32% 52%)`.
- **Day-view direction LOCKED** (latest: `notes/day-view-mockup-4.html`; earlier versions
  kept for history): entries **grouped by category**, chronological within group; **warm ink,
  not black**; colour from season accent (date + FAB) + per-category Caveat heading hues
  (coloured, NOT graphite). **Floating + FAB** bottom-right (thumb reach); paper-grain +
  seasonal radial wash; load stagger. Andy loves the palette. **Category counts removed**
  (was a faint per-group count). **Settings gear** now sits on a frosted paper disc
  (`color-mix` paper bg + blur + shadow) so it lifts off the busy hero watercolour.
- **Hand-drawn entry cards LOCKED** (v4, Andy "really happy"): crayon **hatch fill** in the
  category colour (layered `repeating-linear-gradient`) + wobbly double outline via
  `feTurbulence`+`feDisplacementMap` (`#sketch1/2/3`, 3 seeds + tiny rotations `.s1/.s2/.s3`
  so neighbours differ). Card text gets a **paper-coloured text-shadow halo** so it stays
  legible over the hatch/noise. Left accent bar gone.
- **Hero = painterly watercolour JPG** (LOCKED, replaces the old SVG motifs): bespoke per-season
  image, motif clustered **top-right**, left ~45% empty for the date. `mix-blend-mode: multiply`
  drops the cream paper bg into the app paper; `background-position: top right`; masked fade to
  transparent at the bottom. **All six done** in `notes/` (`spring/earlysummer/latesummer/
  autumn/advent/winterhero.jpg`) — Gemini masters, converted with ffmpeg to a uniform **1000×640,
  JPG q3, 70–102 KB** (crop keeps the right/motif, trims empty-left). Gemini PNG masters
  (`notes/*_Gemini.png`, ~7 MB each) are **git-ignored** — not committed. Minor: Early Summer's
  paper is a touch cooler than the rest, but multiply-blend normalises it.
- **Dark mode: NONE.** Light-only — embrace the warm-paper journal identity (also lets the
  multiply-blend heroes just work). Decided 2026-05-25.
- **Add-entry = full-screen compose** (LOCKED + approved, `notes/add-entry-mockup.html`): the +
  FAB opens a calm full-screen page (hero overhead, Caveat prompt "What are you grateful for?",
  borderless journal text field, category **chips**, primary **"Add to today"** button pinned
  bottom in thumb reach, disabled until there's content). Chosen over a quick bottom sheet for
  the reflective journal feel. **Selected chip = the day-view card's crayon treatment** scaled
  down (overlapping double sketch outline, dense-middle hatch + soft inset "eraser" fade, squarer
  organic corners; displacement scale 4/3.5 vs cards' 6/5) so choosing a category "inks it in."
- **Timestamp** = faint right-aligned **Caveat** scribble (almost hidden). LOCKED.

## Next 2-3 steps (Phase 2 → close)

1. Compose screen + gear fix **approved**; all six hero JPGs **done** (in `notes/`).
2. **Definitive `notes/style-guide.html` built** — tokens (type, 5 category colours, 6 seasonal
   themes), components (entry card, chip, FAB, frosted gear, add button), day-view ×6 seasons,
   compose ×2 states. Light-only. Awaiting Andy's review.
3. **Phase 2 → 3 handoff:** vendor Caveat + Figtree `.woff2` into `assets/fonts/`; move the six
   heroes into `assets/`. Then Phase 3 implements the real app against these tokens.

## Conventions

- Current version: **v0.1.1** (v0.1.0 = Phase 1; v0.1.1 = sheet-URL persists in settings + app locked to Pixel 8a width)
- Deploy URL: `https://andybastable-home.github.io/gratitude/`
- Three-location version bump on every shell commit: `index.html` brand-version span,
  `index.html` footer span, `service-worker.js` `CACHE_VERSION`.
- Each phase = one Claude context window. If a phase grows past that, split it.
- Sync (`sync.js`): uuid-keyed **merge** via Google Sheets REST API v4 + GIS OAuth. No Apps
  Script. `gr.*` localStorage keys. Sheet: 2 tabs (Entries, Metadata). Auto-sync on every
  mutation (2s debounce via `window.scheduleSync`), and on load.
- Local dev: `python -m http.server 8000` (origin must match the authorized JS origin above).
  Canonical test is still the installed PWA on the Pixel 8a.
- github.com auth: SSH key `~/.ssh/github_home_laptop` (see CLAUDE.md → Repo).
