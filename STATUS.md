# STATUS

## Current phase

**Phase 3 — Implement styles** (built at v0.2.0; awaiting Andy's on-device verification)

Phase 1 (sync) done at v0.1.0; Phase 2 (style guide) done. Phase 3 has now applied the
design system to the **real app** (visual spec: `notes/style-guide.html`; rationale:
`notes/phase-2-decisions.md`). Light-only.

**Phase 3 landed (v0.2.0):**
- `styles.css` rewritten to the design system: `:root` tokens, six `.theme-*` season classes,
  warm-paper bg + grain + radial wash, header (accent heart tile + Caveat wordmark + frosted
  gear), seasonal hero band, big Caveat day-date, hand-drawn crayon entry cards (`#sketch1/2/3`
  filters), restyled nav / add-form / settings sheet. Dark-mode removed.
- `index.html`: links `assets/fonts/fonts.css`; inline SVG sketch filter defs; `.hero` element;
  single light `theme-color`; default `theme-earlysummer` body class.
- `app.js`: `seasonForDate()` sets the body theme class from the **viewed day's month** (nav
  between days changes the season); entries render as `.entry` crayon cards (cycle `s1/2/3`)
  with a faint Caveat timestamp; UK date order ("Sunday, 25 May").
- `service-worker.js`: `CACHE_VERSION` v0.2.0; precache fonts + 6 heroes. `manifest.json`
  theme/background colour aligned to cream `#f4ecdd` (was purple — flagged).

**Deferred to Phase 4 (need the category field, which Phase 4 adds):** category *grouping* +
per-category card colours, and the **FAB → full-screen compose** flow with category chips.
Phase 3 keeps the inline add-input as the capture method; cards currently take the season
accent as their ink. PWA install icon (`icons/icon.svg`) still the placeholder — polish later.

**Andy to verify on device / `localhost:8000`:** fonts load (Caveat headers, Figtree body);
season matches the month and changes when navigating days; hero watercolour shows and fades;
crayon cards render (wobble + hatch) and stay legible; gear/nav legible on frosted discs;
add + delete + sync still work; v0.2.0 shows in header + footer.

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
