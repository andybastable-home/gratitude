# STATUS

## Current phase

**Phase 5a — Photos on entries (local-only)** done at **v0.4.0**.

- Dexie v2: new `photos` store (`++id, &uuid, entry_uuid`; `full`/`thumb` Blobs, `created`,
  `mime`, `width`, `height`, `mediaItem_id: null`, `synced: false`).
- `processImageFile`: canvas pipeline, EXIF rotation, full ≤1600px @ JPEG 0.85,
  thumb ≤320px @ JPEG 0.7.
- `getPhotosForDate(d)` batch fetch → `Map<entry_uuid, photo[]>` (one photos query per renderDay).
- Object-URL lifecycle: `_thumbUrls` revoked at the top of each `renderDay`;
  `_viewerUrls` revoked on photo change or viewer close.
- Thumbnail strip always visible on each entry card (not gated behind tap-open).
- Camera button in the tap-to-reveal `.entry-actions` row, styled in the category ink.
- Fullscreen viewer (`#photo-viewer`): prev/next tap zones + arrow keys, Escape/backdrop close,
  confirm-by-tap delete (advances to next photo or closes if last).
- No sync changes; `Photos` sheet tab and Google Photos upload land in **5b**.

**Andy to verify on device / `localhost:8000`:**
1. Open an entry → tap it → camera button appears in category colour.
2. Tap camera → Android shows Camera / Gallery / Files. Take a photo and pick an existing one
   → both appear as thumbnails on the card. Persist after reload and day-nav away/back.
3. Multiple photos on one entry → all thumbnails show; orientation correct (not sideways).
4. Tap a thumbnail → fullscreen viewer; prev/next cycles with multiple; Escape/backdrop/close dismiss.
5. Delete photo in viewer → confirm → removes that thumbnail; other photos and the entry remain;
   camera-roll original untouched.
6. Settings shows **v0.4.0**; entry text sync still round-trips to sheet unchanged.
7. No console errors; rapid viewer open/close and day-nav don't leak URLs.

## Next up

**Phase 5b — Google Photos upload + cross-client sync** (fresh session, Opus recommended):
- Widen `SCOPE` in `sync.js` to add `photoslibrary.appendonly` +
  `photoslibrary.readonly.appcreateddata` (incremental consent verified on 2026-05-30).
- On first upload, `albums.create` → cache id in `localStorage gr.photosAlbumId`.
- Per photo: upload `full` bytes → `mediaItems.batchCreate` with `albumId` → store `mediaItem_id`.
- New `Photos` sheet tab (`uuid, entry_uuid, mediaItem_id, mime, width, height, created,
  synced_at, deleted`); uuid-keyed merge like `Entries`.
- Cross-client pull: `mediaItems:search` → download bytes → regenerate local `thumb`.
- Delete propagation: `albums.batchRemoveMediaItems` (removes from album, not library).
- `SHEET_SCHEMA_VERSION` 2 → 3.

## Conventions

- Current version: **v0.4.0**
- Deploy URL: `https://andybastable-home.github.io/gratitude/`
- Version in two places: `index.html` `.settings-version` + `service-worker.js` `CACHE_VERSION`.
- Each phase = one Claude context window. If a phase grows past that, split it.
- Sync (`sync.js`): uuid-keyed merge via Google Sheets REST API v4 + GIS OAuth. `gr.*` localStorage.
- Local dev: `python -m http.server 8000`. Canonical test: installed PWA on Pixel 8a.
- github.com auth: SSH key `~/.ssh/github_home_laptop` (see CLAUDE.md → Repo).

## Manual setup Andy must do before sync works on-device

1. **Authorized JavaScript origins:** add `https://andybastable-home.github.io` + `http://localhost:8000`.
2. **OAuth consent screen → Test users:** add `andy.bastable@gmail.com`.
3. **APIs enabled:** Google Sheets API + Google Drive API.
4. **GitHub Pages:** enable on the `gratitude` repo (main branch, root).
