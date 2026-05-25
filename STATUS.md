# STATUS

## Current phase

**Phase 3 — Implement styles** (next)

Phase 1 (bootstrap + OAuth/Sheets sync) is **done** at v0.1.0. Phase 2 (style guide) is
**done**: the canonical visual spec is **`notes/style-guide.html`** and the rationale is
archived in **`notes/phase-2-decisions.md`**. The UI today is still the scrappy dev harness
(plain text input + list); Phase 3 replaces its look with the style-guide design, Phase 4
replaces the harness with the real logging UX.

**Phase 2 delivered (ready for Phase 3 to consume):**
- `notes/style-guide.html` — tokens (type, 5 fixed category colours, 6 seasonal themes),
  components (crayon entry card, category chip, FAB, frosted gear, add button), day-view ×6
  seasons, full-screen compose ×2 states. **Light-only.**
- Fonts vendored: `assets/fonts/` (Caveat + Figtree, variable woff2, latin+latin-ext) with
  `assets/fonts/fonts.css` (`@font-face`, weight ranges, `display:swap`).
- Heroes vendored: `assets/heroes/{spring,earlysummer,latesummer,autumn,advent,winter}hero.jpg`
  (1000×640, ~70–102 KB each).

## Phase 3 — next 2–3 steps

1. Wire fonts into the app: `@import` / `<link>` `assets/fonts/fonts.css` from the shell;
   set the Caveat/Figtree stacks in `styles.css`.
2. Implement the design tokens + components from `style-guide.html` into `styles.css` /
   `index.html` (season theming, day-view, compose, hand-drawn card, FAB, gear). Pick the
   active season by current month.
3. Add the new assets (fonts + 6 heroes) to the `service-worker.js` precache so the app stays
   fully offline, and **bump the version in all three places** (see Conventions).

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

Locked Phase 2 design decisions + rationale are archived in `notes/phase-2-decisions.md`;
the visual spec is `notes/style-guide.html`.

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
