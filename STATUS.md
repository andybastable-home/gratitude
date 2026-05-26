# STATUS

## Current phase

**Phase 4 — Logging & categorising** done at **v0.3.6** (awaiting Andy's on-device verification)

**v0.3.6:** the entry Delete button is now Caveat in the category-label colour (`var(--c)`) so
it reads as part of the design rather than a jarring red.

**v0.3.3–v0.3.4:** swipe/arrow nav can't go past today (no logging the future); day count.
**v0.3.5:** count reads "N things this day"; back-dated entries stamp the real time-of-day
(not a flat noon); delete is now tap-card → tap "Delete" (the `.entry-actions` row, room for a
future Edit button); install icon redrawn to match the header heart on the accent-pink tile.

**v0.3.1 layout fixes:** hero moved to body-top (behind the transparent header, spans the
column edge-to-edge — fixes the "header band" gap + the desktop side-leak); FAB + screen-fade
moved to body level with z-index above content so the FAB is tappable on phone (plus
`env(safe-area-inset-bottom)` so it clears the gesture bar).

**v0.3.2 nav/chrome tweaks:** removed the prev/next arrows and "jump to today" — day nav is now
**swipe** (left = next, right = prev; touch) + arrow keys (desktop); month abbreviated + date
font 38px + nowrap so it never wraps; removed the footer and moved the version into the
**settings overlay** (`.settings-version`). Version lives in settings line + SW only.

Phases 1–3 done (sync v0.1.0, style guide, design system applied v0.2.0). Phase 4 adds the
real logging UX + categories, to the locked spec in `notes/style-guide.html`.

**Phase 4 landed (v0.3.0):**
- Five fixed categories (`CATEGORIES` in `app.js`, single source of truth): Bella / Family /
  Nature / Me / God, each a fixed colour + line-icon. A category is **required** to save.
- `index.html`: removed the dev-harness add-form; added the floating **FAB**, the full-screen
  **compose overlay** (`#compose-overlay`: real `<textarea>`, prompt, category chips, Add
  button), an **icon sprite** (`#ic-*`) + **`#chip1/2`** filters, a **day-meta** count line and
  a **screen-fade**.
- `app.js`: `addEntry(text, category)`; `renderDay()` now **groups by category** (fixed order,
  per-category card ink + icon heading; uncategorised/legacy rows fall into a headingless
  fallback group last); compose controller (open/close, single-select chips, live Add
  enable/disable, Escape to close).
- `styles.css`: ported the cat-group / FAB / screen-fade / compose / chips / add-btn blocks;
  `.entry` now inherits `--c` from its group; removed dead `.add-form`/`.add-input`.
- **Sheet schema v1 → v2:** added column **G `category`**. Old data is **not** migrated — the
  sheet was cleared, so fresh sheets write at v2 and the backward path was omitted by design.
  Forward-gate (stall on newer-than-v2 sheet) intact.
- `service-worker.js`: `CACHE_VERSION` v0.3.0.

**Andy to verify on device / `localhost:8000`:** FAB opens compose; ×/Escape closes; Add
disabled until text **and** a chip; chip shows crayon `.sel`, single-select. Saving drops a
card into the right colour group (Bella → Family → Nature → Me → God order); count is right;
delete still works; swipe/arrow-key day nav re-groups. Fresh sheet: 7-col header incl.
`category`, Metadata `schema_version = 2`; category round-trips desktop↔phone. Version shows
in the settings overlay.

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

- Current version: **v0.3.3** (v0.1.0 Phase 1; v0.2.0 Phase 3 design system; v0.3.0 Phase 4 logging + categories; v0.3.1 layout fixes; v0.3.2 swipe nav + version in settings; v0.3.3 no future nav; v0.3.5 "this day" count + real back-dated times + tap-to-delete + real icon)
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
