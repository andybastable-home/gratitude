# Project notes for Claude

## Single user, two trusted clients

This app has **exactly one user (Andy)**, but unlike its sister projects it is used on
**two clients**: his Pixel 8a (primary) and desktop Chrome (secondary). Both log
gratitude entries; both sync through **one Google Sheet**.

Implications:
- No user accounts, no multi-tenant anything, no role abstractions.
- **Two clients, not two users.** Sync is last-write-wins keyed by a per-entry `uuid`
  plus a modified timestamp. No CRDT, no real conflict resolution — the only possible
  conflict is editing the *same* entry offline on both clients at once, which is
  vanishingly rare for one person and not worth designing for.
- This is the one deliberate deviation from `plants` / `food-and-weight`, which are
  framed "single device." Do not copy their full-replace backup/restore sync model —
  it clobbers cross-client edits. Use the uuid-keyed merge (see `sync.js`).
- No onboarding flow, no empty-state copy for strangers, no generic "welcome" UX.
- Hard-coded assumptions about Andy's data shape are fine and preferred over configurability.

## Primary surface: installed PWA on Android (Pixel 8a)

The phone is the primary deployment; desktop Chrome is a real secondary client (used for
logging too), but design decisions favour the phone.

- **Touch-first.** Tap targets >= 44px. No hover-only affordances. No right-click menus.
- **Mobile viewport.** Design for ~412px wide portrait first.
- **One-handed thumb reach.** Primary actions belong near the bottom of the screen.
- **Offline / flaky network is normal.** Anything that touches sync must degrade
  gracefully when offline. Service worker caching matters; dependencies are vendored
  locally (see `assets/vendor/`) so the app works fully offline.
- **Mid-tier mobile perf.** Don't ship large dependencies or heavy per-frame work.
- **PWA install flow matters.** Don't break `manifest.json` or the service worker
  registration without flagging it.

## Multi-phase plan

Each phase is sized to fit in a **single Claude context window** — Andy starts a fresh
session per phase. If a phase grows past that budget, split it.

| Phase | Title                                      | Status      |
| ----- | ------------------------------------------ | ----------- |
| 1     | Bootstrap + OAuth/Sheets sync (one-shot)   | done        |
| 2     | Style guide (iterative HTML preview)       | next        |
| 3     | Implement styles                           | not started |
| 4     | Logging & categorising gratitude items     | not started |
| 5     | Photos → Google Photos album (stable ids)  | not started |

`STATUS.md` is the live source of truth for the current phase and next steps. The table
above is orientation only; do not edit it as a tracker — update `STATUS.md` instead.

## Code map

Tiny vanilla web app — no build step. Skim this before grepping; only read whole files
when the map points you there.

```
index.html         single page; header, day-view pane, settings/sync overlay
app.js             UI, IndexedDB (Dexie), date navigation, settings wiring
sync.js            Google Sheets OAuth + uuid-keyed merge sync, schema-version gating
service-worker.js  network-first shell cache; bump CACHE_VERSION on every release
styles.css         design tokens + styles (don't open unless task is visual)
manifest.json      PWA manifest (don't touch without flagging)
icons/             placeholder SVG (polished later)
assets/vendor/     vendored deps (dexie.min.js) — cached by the SW for offline
.scripts/          export-context.ps1 (Gemini planner workflow)
notes/             design spikes / style guide — read when starting the matching phase
```

### Inside `sync.js`

- **OAuth/token/sheet-bootstrap** ported from `plants/sync.js` (GIS token client,
  `drive.file` scope, token cached in `sessionStorage`, create-or-attach sheet).
- **uuid-keyed merge** ported from `food-and-weight/sync.js`: `pullEntriesFromSheet`
  (upsert each row by uuid; propagate cross-client deletes for rows that were synced but
  vanished from the sheet), `syncEntriesToSheet` (append unsynced rows),
  `updateEntryInSheet` / `deleteEntryFromSheet` (locate row by uuid in column A).
- `syncNow()` = push unsynced → pull/merge. `scheduleSync()` debounces it (2s) after every
  local mutation. On load, a silent re-auth then `syncNow()`.
- `SHEET_SCHEMA_VERSION` gates against a forward-versioned sheet (stalls reads/writes if the
  sheet was written by a newer build). Phase 4 adds the first v1→v2 migration.

As `app.js`/`sync.js` grow, add `// ----` banner section comments and document them here so
future sessions can grep banners instead of reading whole files. The sister project
`food-and-weight/CLAUDE.md` has the established format for that section.

### Data shape (quick reference)

- **IndexedDB** `Gratitude` / store `entries`, keyed `++id` with unique `uuid`.
  Entry shape (v1, minimal — Phase 4 extends): `{ uuid, type:'gratitude', timestamp,
  iso_date, text, synced }`. `synced` is a local-only bool (false = needs pushing).
- **Google Sheet** — title "Gratitude log", two tabs:
  - `Entries` (cols A–F), header v1: `['uuid','epoch','iso_date','type','text','synced_at']`.
  - `Metadata` — `A1/B1` = schema version; `A2/B2` = convention note.
- **`localStorage`** — `gr.sheetId`, `gr.sheetGid`, `gr.email`. **`sessionStorage`** —
  `gr.sync.token` (cached OAuth token across SW-triggered reloads).

## Working under a token budget

This project runs on Claude Pro with hard usage limits. Be deliberate about context.

- **Each phase is its own session.** Don't compress multiple phases into one.
- **No browser automation.** Playwright MCP is not installed and must not be re-introduced.
  UI verification is manual — describe what to check and Andy will run it and report back.
- **Don't read `styles.css` unless the task is visual styling.**
- **Read `STATUS.md` once per session**, not repeatedly.
- **Prefer Grep over reading whole files** when locating a symbol or string.
- **No speculative refactors, no "while we're here" cleanup.** Do exactly what was asked.
- **Skip end-of-turn recap prose.** A one-line "done; STATUS updated" is enough.
- **Perform git operations** (commit and push) as the final step of every task. Stage
  relevant files, commit with a clear message, and push. Andy drives git only if he says so.

## STATUS.md discipline

`STATUS.md` is loaded into context every session. Keep it lean: current phase block + next
2–3 steps + open questions only. When a phase closes, archive the detail to a phase note or
delete it — don't accrete.

## Versioning

**Bump the version with every commit.** Version numbers are how Andy confirms the correct
build loaded on his phone.

- Version lives in **three places** — bump all three in lockstep: `index.html` brand-version
  span, `index.html` footer span, `service-worker.js` `CACHE_VERSION`.
- Semver patch bumps (v0.1.0 → v0.1.1) for most changes; minor bumps for phase milestones.

## Constraints

- **No paid subscriptions, ever.** Personal hobby project. Any solution requiring a paid plan
  is off the table — find a free alternative or flag the constraint. Free tiers (Google
  Sheets/Drive/Photos APIs, GitHub Pages on public repos) are fine.

## Gemini as planning agent

Andy occasionally uses Gemini Pro as a planning/context agent:

1. Run `.scripts/export-context.ps1` (PowerShell) to generate three `.aicontext` files.
2. Paste them into Gemini (its 1M context window handles them easily).
3. Gemini plans the implementation; Andy pastes the plan into a Claude session to implement.

The `.aicontext` files are git-ignored and regenerated on demand.

## Repo

- Personal repo: `andybastable-home/gratitude` on github.com (public).
- Deploy target: `https://andybastable-home.github.io/gratitude/` (GitHub Pages, main / root).
- **github.com auth uses the SSH key `~/.ssh/github_home_laptop`.** There is no `~/.ssh/config`
  mapping, so network ops need it explicitly, e.g.
  `GIT_SSH_COMMAND="ssh -i ~/.ssh/github_home_laptop -o IdentitiesOnly=yes" git push`.
  (`gh` on this machine is logged into Unity's internal GHE, not github.com — don't use it here.)
- OAuth client id: `58841586776-24iml4d2gnq5saou92483707bq3ar80l.apps.googleusercontent.com`
  (same Google Cloud project as `food-and-weight`). Sister projects `plants` and
  `food-and-weight` share the architecture — reference them for sync/OAuth patterns.
