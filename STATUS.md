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
- **Font: open question.** Fraunces felt too samey vs the sisters. Candidates in
  `notes/font-specimen.html` (all OFL / self-hostable): Newsreader, Spectral, Instrument
  Serif, Young Serif, Bricolage Grotesque; body shown in Hanken Grotesk.

## Next 2-3 steps (Phase 2)

1. Andy reviews `notes/font-specimen.html`, picks a display voice (+ body pairing).
2. Claude mocks the real day-view in the chosen font across 2–3 seasonal palettes.
3. Final artifact: `notes/style-guide.html` — tokens, component specs, light + dark, phone
   mockups of the gratitude day view, plus the six seasonal themes. Vendor the chosen
   font(s) into `assets/fonts/`.

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
