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

## Next 2-3 steps (Phase 2)

1. Claude produces multiple distinct design directions as a single self-contained HTML
   preview (app mockups + token grid), in the spirit of `plants/notes/style-guide.html`.
2. Andy picks/refines over a few rounds.
3. Final artifact: `notes/style-guide.html` — tokens, component specs, light + dark, phone
   mockups of the gratitude day view. (Also pick a self-hostable display font for offline.)

## Conventions

- Current version: **v0.1.0**
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
