// ---- Google Sheets sync ----
// OAuth/token/sheet-bootstrap ported from plants/sync.js; the uuid-keyed MERGE
// (push-append + pull-upsert + delete-propagation) is ported from
// food-and-weight/sync.js. We deliberately do NOT use Plants' full-replace
// backup/restore, because Gratitude is a genuine two-client app and full-replace
// would clobber entries logged on the other client.
const CLIENT_ID = '58841586776-24iml4d2gnq5saou92483707bq3ar80l.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';

const SHEET_ID_KEY  = 'gr.sheetId';
const SHEET_GID_KEY = 'gr.sheetGid';   // numeric gid of the Entries tab (needed for row deletes)
const EMAIL_KEY     = 'gr.email';
// Token cached in sessionStorage so SW-triggered reloads don't re-fire the silent OAuth flow.
const TOKEN_CACHE_KEY = 'gr.sync.token';

const SHEET_SCHEMA_VERSION = 1;

const ENTRIES_HEADER = ['uuid', 'epoch', 'iso_date', 'type', 'text', 'synced_at'];
const ENTRIES_RANGE_ALL = 'Entries!A:F';
const ENTRIES_ROW_RANGE = (rowNum) => `Entries!A${rowNum}:F${rowNum}`;

const ENTRY_CONVENTION_NOTE =
  'Each row is one gratitude entry. uuid is the stable id used for cross-client merge. ' +
  'epoch is ms-since-1970 of the logged moment; iso_date (YYYY-MM-DD, local) is canonical ' +
  'for which day the entry belongs to and may differ from epoch when back-dating. ' +
  'synced_at is the moment the row was last written by a client.';

let tokenClient    = null;
let accessToken    = null;
let tokenExpiresAt = 0;
// True until we detect a sheet whose schema_version is newer than this build understands.
// While false, pulls/pushes of Entries are skipped to avoid corrupting a forward-versioned sheet.
let schemaCompatible = true;

const syncUI = {
  overlay: null,
  url:     null,
  connect: null,
  syncNow: null,
  forget:  null,
  link:    null,
  status:  null,
};

// ---- localStorage helpers ----
function getSheetId()   { return localStorage.getItem(SHEET_ID_KEY); }
function setSheetId(id) { localStorage.setItem(SHEET_ID_KEY, id); }
function clearSheetId() { localStorage.removeItem(SHEET_ID_KEY); }

function getSheetGid()    { const v = localStorage.getItem(SHEET_GID_KEY); return v !== null ? Number(v) : 0; }
function setSheetGid(gid) { localStorage.setItem(SHEET_GID_KEY, String(gid)); }
function clearSheetGid()  { localStorage.removeItem(SHEET_GID_KEY); }

function getEmail()   { return localStorage.getItem(EMAIL_KEY); }
function setEmail(e)  { localStorage.setItem(EMAIL_KEY, e); }
function clearEmail() { localStorage.removeItem(EMAIL_KEY); }

// ---- Token management (ported from plants/sync.js) ----
function tokenValid() {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

function loadCachedToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return false;
    const { token, expiresAt } = JSON.parse(raw);
    if (token && expiresAt && Date.now() < expiresAt) {
      accessToken    = token;
      tokenExpiresAt = expiresAt;
      return true;
    }
    sessionStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    sessionStorage.removeItem(TOKEN_CACHE_KEY);
  }
  return false;
}

function saveCachedToken() {
  if (!accessToken || !tokenExpiresAt) return;
  try {
    sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token: accessToken, expiresAt: tokenExpiresAt }));
  } catch {}
}

function clearCachedToken() {
  try { sessionStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
}

function ensureClient() {
  if (tokenClient) return true;
  if (!window.google?.accounts?.oauth2) return false;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    use_fedcm_for_prompt: true,
    callback: () => {},
    error_callback: () => {},
  });
  return true;
}

function requestToken({ silent }) {
  return new Promise((resolve, reject) => {
    if (!ensureClient()) { reject(new Error('GIS not ready')); return; }
    let settled = false;
    const settle = (fn) => (...args) => { if (settled) return; settled = true; fn(...args); };

    tokenClient.callback = settle((resp) => {
      if (resp.error) { reject(new Error(`${resp.error}: ${resp.error_description || ''}`)); return; }
      accessToken    = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
      saveCachedToken();
      resolve(resp);
    });
    tokenClient.error_callback = settle((err) => {
      reject(new Error(`${err?.type || 'error'}: ${err?.message || JSON.stringify(err)}`));
    });
    if (silent) {
      setTimeout(settle(() => reject(new Error('silent attempt timed out'))), 8000);
    }
    // 'consent' only on a fresh first-time connect (no email stored). On reconnects use ''
    // so the browser reuses the existing grant without a full consent popup.
    const hint = getEmail();
    const params = { prompt: silent ? '' : (hint ? '' : 'consent') };
    if (hint) params.hint = hint;
    tokenClient.requestAccessToken(params);
  });
}

async function captureEmailIfNeeded() {
  if (getEmail()) return;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.email) {
      setEmail(data.email);
      console.log('[sync] Account pinned:', data.email);
    }
  } catch (err) {
    console.warn('[sync] Email capture failed:', err.message);
  }
}

async function ensureFreshToken() {
  if (tokenValid()) return accessToken;
  await requestToken({ silent: true });
  return accessToken;
}

// ---- API wrapper ----
async function apiCall(url, opts = {}) {
  const token = await ensureFreshToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err  = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---- Sheet bootstrap ----
async function ensureSheet() {
  if (getSheetId()) return;
  console.log('[sync] Creating sheet…');
  const data = await apiCall('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'Gratitude log' },
      sheets: [
        { properties: { title: 'Entries' } },
        { properties: { title: 'Metadata' } },
      ],
    }),
  });
  const sid = data.spreadsheetId;
  setSheetId(sid);
  const entriesTab = (data.sheets || []).find((s) => s.properties?.title === 'Entries');
  if (entriesTab) setSheetGid(entriesTab.properties.sheetId);
  console.log('[sync] Sheet created:', sid);

  await apiCall(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/Entries!A1:F1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [ENTRIES_HEADER] }) }
  );
  await apiCall(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/Metadata!A1:B2?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [
      ['schema_version', SHEET_SCHEMA_VERSION],
      ['convention', ENTRY_CONVENTION_NOTE],
    ] }) }
  );
}

function extractSheetId(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function attachToSheet(input) {
  const sheetId = extractSheetId(input);
  if (!sheetId) throw new Error('Could not find a sheet ID in that URL');

  const meta = await apiCall(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`
  );
  const tabs = meta.sheets || [];
  if (!tabs.find((s) => s.properties?.title === 'Metadata')) {
    throw new Error('Sheet has no "Metadata" tab — wrong file?');
  }
  const entriesTab = tabs.find((s) => s.properties?.title === 'Entries');
  if (!entriesTab) throw new Error('Sheet has no "Entries" tab — wrong file?');

  setSheetId(sheetId);
  setSheetGid(entriesTab.properties.sheetId);
  console.log('[sync] Attached to sheet:', sheetId);
}

async function readSheetSchemaVersion(sheetId) {
  try {
    const data = await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Metadata!A:B`);
    const rows = data.values || [];
    const row = rows.find((r) => r[0] === 'schema_version');
    return row ? Number(row[1]) : null;
  } catch {
    return null;
  }
}

// ---- Row <-> entry mapping ----
function entryToRow(e) {
  return [
    e.uuid,
    e.timestamp,
    e.iso_date || (typeof isoDate === 'function' ? isoDate(new Date(e.timestamp)) : ''),
    e.type || 'gratitude',
    e.text || '',
    new Date().toISOString(),
  ];
}

// ---- Pull (sheet → local, uuid-keyed merge) ----
async function pullEntriesFromSheet() {
  if (!getSheetId()) return 0;
  const sheetId = getSheetId();

  try {
    const version = await readSheetSchemaVersion(sheetId);
    if (version != null && version > SHEET_SCHEMA_VERSION) {
      schemaCompatible = false;
      console.warn(`[sync] Sheet schema v${version} is newer than this app (v${SHEET_SCHEMA_VERSION}). Sync disabled.`);
      setSyncStatus(`Sheet was written by a newer app version (v${version}). Update the PWA to sync.`, 'error');
      return 0;
    }
    schemaCompatible = true;

    const data = await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${ENTRIES_RANGE_ALL}`);
    const rows = data.values || [];
    if (rows.length <= 1) return 0;

    const sheetUuids = new Set();
    let added = 0, updated = 0;
    for (const row of rows.slice(1)) {
      const id = row[0];
      if (!id) continue;
      sheetUuids.add(id);
      const epoch = Number(row[1]) || Date.parse(row[2]) || Date.now();
      const fields = {
        uuid: id,
        timestamp: epoch,
        iso_date: row[2] || '',
        type: row[3] || 'gratitude',
        text: row[4] || '',
        synced: true,
      };
      const existing = await db.entries.where('uuid').equals(id).first();
      if (existing) {
        await db.entries.update(existing.id, fields);
        updated++;
      } else {
        await db.entries.add(fields);
        added++;
      }
    }

    // Cross-client delete propagation: a local entry that was once synced (synced:true)
    // but whose uuid is no longer in the sheet was deleted on the other client.
    // Local-only entries (synced:false, not yet pushed) are protected.
    const removed = await db.entries
      .filter((e) => e.synced === true && e.uuid && !sheetUuids.has(e.uuid))
      .delete();

    console.log(`[sync] Pulled ${added + updated} entries (${added} new, ${updated} updated, ${removed} removed)`);
    if (typeof renderDay === 'function') renderDay();
    return added + updated + removed;
  } catch (err) {
    console.warn('[sync] pullEntriesFromSheet failed:', err.message);
    setSyncStatus(`Pull failed: ${err.message.slice(0, 100)}`, 'error');
    return 0;
  }
}

// ---- Push (local → sheet, append unsynced) ----
async function pushUnsynced() {
  if (!schemaCompatible) { console.warn('[sync] push blocked: sheet schema incompatible'); return 0; }
  const unsynced = await getUnsyncedEntries();
  if (!unsynced.length) return 0;

  await ensureFreshToken();
  await ensureSheet();
  const sid = getSheetId();
  const rows = unsynced.map(entryToRow);
  await apiCall(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/Entries!A1:append?valueInputOption=RAW`,
    { method: 'POST', body: JSON.stringify({ values: rows }) }
  );
  // Mark pushed (only reached if the append succeeded).
  await Promise.all(unsynced.map((e) => db.entries.update(e.id, { synced: true })));
  console.log('[sync] Pushed', rows.length, 'entries');
  return rows.length;
}

async function findRowIndexByUuid(sheetId, uuid) {
  const colA = await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Entries!A:A`);
  const rows = colA.values || [];
  return rows.findIndex((r, i) => i > 0 && String(r[0]) === String(uuid));
}

async function deleteEntryFromSheet(uuid) {
  if (!getSheetId() || !schemaCompatible) return;
  try {
    await ensureFreshToken();
    const sheetId = getSheetId();
    const rowIndex = await findRowIndexByUuid(sheetId, uuid);
    if (rowIndex === -1) { console.log('[sync] Entry not in sheet, skipping row delete'); return; }
    await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId: getSheetGid(), dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        }],
      }),
    });
    console.log('[sync] Row deleted from sheet');
  } catch (err) {
    console.warn('[sync] deleteEntryFromSheet failed:', err.message);
  }
}
window.deleteEntryFromSheet = deleteEntryFromSheet;

// updateEntryInSheet is unused by the Phase-1 dev harness (no edit UI) but is the
// in-place update primitive Phase 4 will use when entries become editable.
async function updateEntryInSheet(entry) {
  if (!getSheetId() || !schemaCompatible) return;
  await ensureFreshToken();
  const sheetId = getSheetId();
  const rowIndex = await findRowIndexByUuid(sheetId, entry.uuid);
  if (rowIndex === -1) { console.log('[sync] updateEntryInSheet: entry not found'); return; }
  await apiCall(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${ENTRIES_ROW_RANGE(rowIndex + 1)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [entryToRow(entry)] }) }
  );
  console.log('[sync] Row updated in sheet:', entry.uuid);
}
window.updateEntryInSheet = updateEntryInSheet;

// ---- Sync orchestration ----
async function syncNow() {
  if (!getSheetId()) { setSyncStatus('No sheet connected.', 'error'); return; }
  setSyncStatus('Syncing…', 'info');
  try {
    await ensureFreshToken();
    await pushUnsynced();
    await pullEntriesFromSheet();
    setSyncStatus(`Synced at ${new Date().toLocaleTimeString()}`, 'ok');
    renderSyncUI();
  } catch (err) {
    console.warn('[sync] syncNow failed:', err.message);
    setSyncStatus(`Sync failed: ${err.message.slice(0, 120)}`, 'error');
  }
}
window.syncNow = syncNow;

let syncTimer = null;
function scheduleSync() {
  if (!getSheetId()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow().catch((err) => console.warn('[sync] scheduleSync error:', err.message));
  }, 2000);
}
window.scheduleSync = scheduleSync;

// ---- Sync UI controller ----
function setSyncStatus(text, tone) {
  if (!syncUI.status) return;
  syncUI.status.textContent = text || '';
  syncUI.status.classList.remove('is-error', 'is-info', 'is-ok');
  if (tone) syncUI.status.classList.add(`is-${tone}`);
}

function renderSyncUI() {
  const connected = !!getSheetId();
  const editUrl = connected ? `https://docs.google.com/spreadsheets/d/${getSheetId()}/edit` : '';
  if (syncUI.link) {
    syncUI.link.hidden = !connected;
    if (connected) syncUI.link.href = editUrl;
  }
  // Keep the connected sheet's URL visible in the field. Only fill when empty so we
  // never clobber a different URL the user is mid-way through pasting.
  if (syncUI.url && connected && !syncUI.url.value) syncUI.url.value = editUrl;
  if (syncUI.forget)  syncUI.forget.hidden    = !connected;
  if (syncUI.syncNow) syncUI.syncNow.disabled = !connected;
  if (syncUI.connect) syncUI.connect.textContent = connected ? 'Reconnect' : 'Connect';
}

function openSettings() {
  if (!syncUI.overlay) return;
  renderSyncUI();
  syncUI.overlay.hidden = false;
}
function closeSettings() {
  if (!syncUI.overlay) return;
  syncUI.overlay.hidden = true;
}
window.openSettings  = openSettings;
window.closeSettings = closeSettings;

async function actionConnect() {
  setSyncStatus('', '');
  const inputVal = syncUI.url?.value || '';
  try {
    await requestToken({ silent: false });
    await captureEmailIfNeeded();
    if (inputVal.trim()) {
      setSyncStatus('Attaching…', 'info');
      await attachToSheet(inputVal);
    } else {
      setSyncStatus('Creating sheet…', 'info');
      await ensureSheet();
    }
    renderSyncUI();
    setSyncStatus('Connected. Syncing…', 'info');
    await syncNow();
  } catch (err) {
    console.warn('[sync] Connect failed:', err.message);
    setSyncStatus(`Connect failed: ${err.message.slice(0, 120)}`, 'error');
  }
}

function actionForget() {
  clearSheetId();
  clearSheetGid();
  clearEmail();
  clearCachedToken();
  accessToken    = null;
  tokenExpiresAt = 0;
  tokenClient    = null;
  if (syncUI.url) syncUI.url.value = '';
  console.log('[sync] Disconnected');
  renderSyncUI();
  setSyncStatus('Disconnected.', 'info');
}

function bindSyncUI() {
  syncUI.overlay = document.getElementById('settings-overlay');
  syncUI.url     = document.getElementById('sync-url');
  syncUI.connect = document.getElementById('sync-connect');
  syncUI.syncNow = document.getElementById('sync-now');
  syncUI.forget  = document.getElementById('sync-forget');
  syncUI.link    = document.getElementById('sync-sheet-link');
  syncUI.status  = document.getElementById('sync-status');

  const closeBtn = document.getElementById('settings-close');
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  if (syncUI.overlay) {
    syncUI.overlay.addEventListener('click', (e) => {
      if (e.target === syncUI.overlay) closeSettings();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && syncUI.overlay && !syncUI.overlay.hidden) closeSettings();
  });

  if (syncUI.connect) syncUI.connect.addEventListener('click', actionConnect);
  if (syncUI.syncNow) syncUI.syncNow.addEventListener('click', syncNow);
  if (syncUI.forget)  syncUI.forget.addEventListener('click', actionForget);
}

function initOnLoad() {
  if (!window.google?.accounts?.oauth2) {
    setTimeout(initOnLoad, 200);
    return;
  }
  bindSyncUI();
  renderSyncUI();
  if (!getSheetId()) return;

  const hadCachedToken = loadCachedToken();
  (async () => {
    if (!tokenValid()) {
      await requestToken({ silent: true });
      console.log('[sync] Silent re-auth ok');
    } else {
      console.log('[sync] Reusing cached token (skipping OAuth)');
    }
    await captureEmailIfNeeded();
    await syncNow();
  })().catch((err) => {
    console.warn('[sync] init failed:', err.message);
    if (hadCachedToken) {
      accessToken    = null;
      tokenExpiresAt = 0;
      clearCachedToken();
    }
  });
}

initOnLoad();
