// ------------------------------------------------------------------
// Service worker
// ------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.error('Service worker registration failed', err);
    });
  });

  // Auto-reload when a new SW takes control so updates land without a second refresh.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// ------------------------------------------------------------------
// Database
// ------------------------------------------------------------------
const db = new Dexie('Gratitude');
db.version(1).stores({
  // `synced` is intentionally NOT indexed — IndexedDB can't index booleans; we filter instead.
  entries: '++id, &uuid, iso_date, timestamp',
});
db.version(2).stores({
  entries: '++id, &uuid, iso_date, timestamp',  // unchanged
  photos:  '++id, &uuid, entry_uuid',            // new in 5a; synced/mediaItem_id not indexed
});

// ------------------------------------------------------------------
// Date / number helpers
// ------------------------------------------------------------------
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function uuid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
function formatHeading(d) {
  const target = isoDate(d);
  if (target === isoDate(new Date())) return 'Today';
  if (target === isoDate(addDays(new Date(), -1))) return 'Yesterday';
  // Abbreviated month (matches the style-guide concept; keeps the date on one line).
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}
function formatTime(ts) {
  const d = new Date(ts);
  let hr = d.getHours() % 12; if (hr === 0) hr = 12;
  return `${hr}.${String(d.getMinutes()).padStart(2, '0')}`;
}

// ------------------------------------------------------------------
// Seasonal theme — six UK mini-seasons, follows the viewed day's month
// ------------------------------------------------------------------
const SEASON_CLASSES = ['theme-spring', 'theme-earlysummer', 'theme-latesummer', 'theme-autumn', 'theme-advent', 'theme-winter'];
function seasonForDate(d) {
  const m = d.getMonth();
  if (m <= 1) return 'theme-winter';      // Jan–Feb
  if (m <= 3) return 'theme-spring';      // Mar–Apr
  if (m <= 5) return 'theme-earlysummer'; // May–Jun
  if (m <= 8) return 'theme-latesummer';  // Jul–Sep
  if (m <= 10) return 'theme-autumn';     // Oct–Nov
  return 'theme-advent';                  // Dec
}
function applySeason(d) {
  document.body.classList.remove(...SEASON_CLASSES);
  document.body.classList.add(seasonForDate(d));
}

// ------------------------------------------------------------------
// Categories — single source of truth, fixed display order
// ------------------------------------------------------------------
const CATEGORIES = [
  { key: 'wife',   label: 'Bella',  icon: 'ic-heart' },
  { key: 'family', label: 'Family', icon: 'ic-family' },
  { key: 'nature', label: 'Nature', icon: 'ic-leaf' },
  { key: 'me',     label: 'Me',     icon: 'ic-me' },
  { key: 'god',    label: 'God',    icon: 'ic-cross' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// ------------------------------------------------------------------
// State + DOM refs
// ------------------------------------------------------------------
let currentDate = startOfDay(new Date());
let pendingEntryUuid = null;

const els = {
  date:  document.getElementById('day-date'),
  count: document.getElementById('day-count'),
  main:  document.querySelector('.app-main'),
  list:  document.getElementById('entry-list'),
  fab:   document.getElementById('fab'),
};

// compose overlay refs
const compose = {
  overlay:  document.getElementById('compose-overlay'),
  close:    document.getElementById('compose-close'),
  date:     document.getElementById('compose-date'),
  field:    document.getElementById('compose-field'),
  chips:    document.getElementById('compose-chips'),
  add:      document.getElementById('compose-add'),
  addLabel: document.getElementById('compose-add-label'),
  selected: null,
};

// Hidden file input at body level (set in index.html).
const photoInput = document.getElementById('photo-input');

// ---- Photo viewer state (populated in init once DOM refs are ready) ----
let viewerPhotos = [];
let viewerIndex = 0;
let viewerDeletePending = false;
const viewer = {
  overlay: null,
  img:     null,
  counter: null,
  prev:    null,
  next:    null,
  delBtn:  null,
  close:   null,
};

// ------------------------------------------------------------------
// Data access — entries
// ------------------------------------------------------------------
async function getEntriesForDate(d) {
  return db.entries.where('iso_date').equals(isoDate(d)).toArray();
}

// Used by sync.js to find rows that still need pushing to the sheet.
async function getUnsyncedEntries() {
  return db.entries.filter((e) => !e.synced).toArray();
}
window.getUnsyncedEntries = getUnsyncedEntries;

// ------------------------------------------------------------------
// Actions — entries
// ------------------------------------------------------------------
async function addEntry(text, category) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  // Stamp the viewed day with the current time-of-day. For today this is "now"; for a
  // back-dated entry it keeps a real clock time (not a flat noon) while staying inside the
  // chosen day (so the stamp's date can't drift away from iso_date).
  const now = new Date();
  const stamp = startOfDay(currentDate);
  stamp.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  const timestamp = stamp.getTime();
  await db.entries.add({
    uuid: uuid(),
    type: 'gratitude',
    timestamp,
    iso_date: isoDate(currentDate),
    text: trimmed,
    category: category || '',
    synced: false,
  });
  await renderDay();
  window.scheduleSync && window.scheduleSync();
}

async function deleteEntry(id) {
  const entry = await db.entries.get(id);
  if (!entry) return;
  // Remove from the sheet first so a later pull doesn't resurrect it on this client.
  if (entry.synced && window.deleteEntryFromSheet) {
    await window.deleteEntryFromSheet(entry.uuid);
  }
  await db.entries.delete(id);
  await renderDay();
}

function setDate(d) {
  currentDate = startOfDay(d);
  renderDay();
}

// Step by `delta` days, but never past today (no logging the future).
function navigateDay(delta) {
  const target = addDays(currentDate, delta);
  if (isoDate(target) > isoDate(new Date())) return;
  setDate(target);
}

// ---- Photos ----

// Object-URL pools — revoke before re-rendering to avoid leaks.
// _thumbUrls: thumbnail object URLs from renderDay; revoked at the top of each renderDay call.
// _viewerUrls: full-image URL for the current viewer photo; revoked on photo change or close.
let _thumbUrls = [];
let _viewerUrls = [];
function revokeThumbUrls() { _thumbUrls.forEach((u) => URL.revokeObjectURL(u)); _thumbUrls = []; }
function revokeViewerUrls() { _viewerUrls.forEach((u) => URL.revokeObjectURL(u)); _viewerUrls = []; }

// Compress a File to full (≤1600px) and thumb (≤320px) JPEG blobs.
// imageOrientation:'from-image' respects EXIF rotation so phone photos aren't sideways.
async function processImageFile(file) {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    function makeCanvas(maxEdge) {
      const ratio = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * ratio);
      const h = Math.round(bmp.height * ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return c;
    }
    const fullCanvas = makeCanvas(1600);
    const thumbCanvas = makeCanvas(320);
    const width = fullCanvas.width;
    const height = fullCanvas.height;
    const full = await new Promise((res) => fullCanvas.toBlob(res, 'image/jpeg', 0.85));
    const thumb = await new Promise((res) => thumbCanvas.toBlob(res, 'image/jpeg', 0.7));
    bmp.close();
    return { full, thumb, width, height };
  } catch (err) {
    console.warn('processImageFile failed', err);
    return null;
  }
}

async function getPhotosForEntry(entryUuid) {
  const rows = await db.photos.where('entry_uuid').equals(entryUuid).toArray();
  return rows.sort((a, b) => a.created - b.created);
}

// Batch fetch for all entries on a day; returns Map<entry_uuid, photo[]>.
// One photos query replaces N per-entry queries so renderDay stays fast.
async function getPhotosForDate(d) {
  const entries = await getEntriesForDate(d);
  if (!entries.length) return new Map();
  const uuids = entries.map((e) => e.uuid);
  const photos = await db.photos.where('entry_uuid').anyOf(uuids).toArray();
  const map = new Map();
  for (const p of photos) {
    if (!map.has(p.entry_uuid)) map.set(p.entry_uuid, []);
    map.get(p.entry_uuid).push(p);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.created - b.created);
  return map;
}

// Sequential processing keeps peak memory manageable on mid-tier phones.
async function addPhotosToEntry(entryUuid, fileList) {
  for (const file of Array.from(fileList)) {
    const result = await processImageFile(file);
    if (!result) continue;
    await db.photos.add({
      uuid: uuid(),
      entry_uuid: entryUuid,
      mime: 'image/jpeg',
      width: result.width,
      height: result.height,
      created: Date.now(),
      full: result.full,
      thumb: result.thumb,
      mediaItem_id: null,  // 5b populates (Google Photos media item id)
      synced: false,       // 5b uses
    });
  }
  await renderDay();
}

async function deletePhoto(photoId) {
  await db.photos.delete(photoId);
}

function openCameraFor(entryUuid) {
  pendingEntryUuid = entryUuid;
  if (photoInput) photoInput.click();
}

// ---- Photo viewer ----

function openViewer(photos, index) {
  viewerPhotos = photos;
  viewerDeletePending = false;
  if (viewer.delBtn) { viewer.delBtn.textContent = 'Delete photo'; viewer.delBtn.classList.remove('is-confirm'); }
  if (viewer.overlay) viewer.overlay.hidden = false;
  showViewerPhoto(index);
}

function closeViewer() {
  if (viewer.overlay) viewer.overlay.hidden = true;
  revokeViewerUrls();
  viewerPhotos = [];
  viewerDeletePending = false;
  if (viewer.delBtn) { viewer.delBtn.textContent = 'Delete photo'; viewer.delBtn.classList.remove('is-confirm'); }
}

function showViewerPhoto(idx) {
  revokeViewerUrls();
  viewerIndex = idx;
  viewerDeletePending = false;
  if (viewer.delBtn) { viewer.delBtn.textContent = 'Delete photo'; viewer.delBtn.classList.remove('is-confirm'); }
  const photo = viewerPhotos[idx];
  if (!photo || !viewer.img) return;
  const url = URL.createObjectURL(photo.full);
  _viewerUrls.push(url);
  viewer.img.src = url;
  if (viewer.counter) {
    viewer.counter.textContent = viewerPhotos.length > 1 ? `${idx + 1} / ${viewerPhotos.length}` : '';
  }
  if (viewer.prev) viewer.prev.hidden = idx === 0;
  if (viewer.next) viewer.next.hidden = idx >= viewerPhotos.length - 1;
}

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------
// One sketch counter shared across all groups so neighbouring cards always differ.
let sketchCursor = 0;
function closeAllEntries() {
  if (!els.list) return;
  els.list.querySelectorAll('.entry.is-open').forEach((c) => c.classList.remove('is-open'));
}

function entryCard(e, photos) {
  const card = document.createElement('article');
  card.className = `entry s${(sketchCursor++ % 3) + 1}`;

  const p = document.createElement('p');
  p.className = 'entry-text';
  p.textContent = e.text;

  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = formatTime(e.timestamp);

  card.append(p, time);

  // Thumbnail strip — always visible (not gated behind tap-open).
  if (photos && photos.length) {
    const strip = document.createElement('div');
    strip.className = 'entry-photos';
    photos.forEach((ph, i) => {
      const img = document.createElement('img');
      img.className = 'entry-photo-thumb';
      const url = URL.createObjectURL(ph.thumb);
      _thumbUrls.push(url);
      img.src = url;
      img.alt = '';
      img.addEventListener('click', (ev) => { ev.stopPropagation(); openViewer(photos, i); });
      strip.appendChild(img);
    });
    card.appendChild(strip);
  }

  // Tapping the card reveals a confirm-by-tap action row: camera + delete.
  const actions = document.createElement('div');
  actions.className = 'entry-actions';

  const cam = document.createElement('button');
  cam.type = 'button';
  cam.className = 'entry-camera';
  cam.setAttribute('aria-label', 'Add photo');
  cam.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-camera"/></svg>';
  cam.addEventListener('click', (ev) => { ev.stopPropagation(); openCameraFor(e.uuid); });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'entry-delete';
  del.textContent = 'Delete';
  del.addEventListener('click', (ev) => { ev.stopPropagation(); deleteEntry(e.id); });

  actions.append(cam, del);
  card.appendChild(actions);

  card.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const open = card.classList.contains('is-open');
    closeAllEntries();
    if (!open) card.classList.add('is-open');
  });
  return card;
}

function catGroup(entries, cat, photoMap) {
  const section = document.createElement('section');
  section.className = cat ? `cat-group is-${cat.key}` : 'cat-group';
  if (cat) {
    const head = document.createElement('h3');
    head.className = 'cat-head';
    head.innerHTML =
      `<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#${cat.icon}"/></svg>`;
    head.append(document.createTextNode(cat.label));
    section.appendChild(head);
  }
  const list = document.createElement('div');
  list.className = 'entry-list';
  entries.forEach((e) => list.appendChild(entryCard(e, photoMap ? (photoMap.get(e.uuid) || []) : [])));
  section.appendChild(list);
  return section;
}

async function renderDay() {
  // Revoke previous thumbnail object URLs before creating new ones (prevent leaks).
  revokeThumbUrls();
  applySeason(currentDate);
  const heading = formatHeading(currentDate);
  if (els.date) els.date.textContent = heading;
  const entries = await getEntriesForDate(currentDate);
  entries.sort((a, b) => a.timestamp - b.timestamp);

  if (els.count) {
    els.count.innerHTML = entries.length
      ? `<strong>${entries.length}</strong> ${entries.length === 1 ? 'thing' : 'things'} this day`
      : '';
  }

  const photoMap = await getPhotosForDate(currentDate);

  els.list.innerHTML = '';
  sketchCursor = 0;
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'entry-empty';
    empty.textContent = 'Nothing here yet.';
    els.list.appendChild(empty);
    return;
  }

  // Known categories first, in fixed order; uncategorised/legacy rows fall into a
  // headingless neutral group rendered last.
  for (const cat of CATEGORIES) {
    const group = entries.filter((e) => e.category === cat.key);
    if (group.length) els.list.appendChild(catGroup(group, cat, photoMap));
  }
  const leftover = entries.filter((e) => !CATEGORY_BY_KEY[e.category]);
  if (leftover.length) els.list.appendChild(catGroup(leftover, null, photoMap));
}
window.renderDay = renderDay;

// ------------------------------------------------------------------
// Compose (full-screen) controller
// ------------------------------------------------------------------
function buildChips() {
  if (!compose.chips) return;
  compose.chips.innerHTML = '';
  for (const cat of CATEGORIES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip is-${cat.key}`;
    chip.dataset.key = cat.key;
    chip.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#${cat.icon}"/></svg>`;
    chip.append(document.createTextNode(cat.label));
    chip.addEventListener('click', () => selectChip(cat.key));
    compose.chips.appendChild(chip);
  }
}

function selectChip(key) {
  compose.selected = key;
  if (compose.chips) {
    for (const chip of compose.chips.children) {
      chip.classList.toggle('sel', chip.dataset.key === key);
    }
  }
  updateAddState();
}

function updateAddState() {
  const ready = !!compose.field?.value.trim() && !!compose.selected;
  if (!compose.add) return;
  compose.add.disabled = !ready;
  compose.add.classList.toggle('is-disabled', !ready);
}

function openCompose() {
  if (!compose.overlay) return;
  compose.selected = null;
  if (compose.field) compose.field.value = '';
  if (compose.chips) for (const chip of compose.chips.children) chip.classList.remove('sel');
  if (compose.date) compose.date.textContent = formatHeading(currentDate);
  if (compose.addLabel) {
    const onToday = isoDate(currentDate) === isoDate(new Date());
    compose.addLabel.textContent = onToday ? 'Add to today' : `Add to ${formatHeading(currentDate)}`;
  }
  updateAddState();
  compose.overlay.hidden = false;
  if (compose.field) compose.field.focus();
}

function closeCompose() {
  if (compose.overlay) compose.overlay.hidden = true;
}

function submitCompose() {
  const text = compose.field?.value || '';
  if (!text.trim() || !compose.selected) return;
  addEntry(text, compose.selected);
  closeCompose();
}

// ------------------------------------------------------------------
// Day navigation — swipe (phone) + arrow keys (desktop)
// ------------------------------------------------------------------
function bindDayNav() {
  // Horizontal swipe on the day surface: left → next day, right → previous day.
  if (els.main) {
    let startX = 0, startY = 0, tracking = false;
    els.main.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    els.main.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Need a clear, mostly-horizontal gesture so we don't hijack vertical scroll.
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      navigateDay(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (compose.overlay && !compose.overlay.hidden) return;
    if (viewer.overlay && !viewer.overlay.hidden) return;  // viewer handles its own arrows
    const settings = document.getElementById('settings-overlay');
    if (settings && !settings.hidden) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    navigateDay(e.key === 'ArrowLeft' ? -1 : 1);
  });
}

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
function init() {
  // Populate viewer refs (elements live in index.html).
  viewer.overlay = document.getElementById('photo-viewer');
  viewer.img     = document.getElementById('viewer-img');
  viewer.counter = document.getElementById('viewer-counter');
  viewer.prev    = document.getElementById('viewer-prev');
  viewer.next    = document.getElementById('viewer-next');
  viewer.delBtn  = document.getElementById('viewer-delete');
  viewer.close   = document.getElementById('viewer-close');

  bindDayNav();
  // A tap anywhere outside an open entry collapses its action row.
  document.addEventListener('click', closeAllEntries);

  buildChips();
  els.fab && els.fab.addEventListener('click', openCompose);
  compose.close && compose.close.addEventListener('click', closeCompose);
  compose.field && compose.field.addEventListener('input', updateAddState);
  compose.add && compose.add.addEventListener('click', submitCompose);

  // Hidden photo file input — change fires after user picks a file/photo.
  if (photoInput) {
    photoInput.addEventListener('change', async (ev) => {
      const entryUuid = pendingEntryUuid;
      pendingEntryUuid = null;
      if (!entryUuid || !ev.target.files || !ev.target.files.length) return;
      await addPhotosToEntry(entryUuid, ev.target.files);
      ev.target.value = '';  // reset so re-picking the same file refires change
    });
  }

  // Photo viewer button wiring.
  if (viewer.close) viewer.close.addEventListener('click', closeViewer);
  if (viewer.prev)  viewer.prev.addEventListener('click', () => { if (viewerIndex > 0) showViewerPhoto(viewerIndex - 1); });
  if (viewer.next)  viewer.next.addEventListener('click', () => { if (viewerIndex < viewerPhotos.length - 1) showViewerPhoto(viewerIndex + 1); });

  // Clicking the dark backdrop (not the image or controls) closes the viewer.
  if (viewer.overlay) {
    viewer.overlay.addEventListener('click', (ev) => {
      if (ev.target === viewer.overlay) closeViewer();
    });
  }

  // Viewer delete — confirm-by-tap: first tap shows confirm label, second tap deletes.
  if (viewer.delBtn) {
    viewer.delBtn.addEventListener('click', async () => {
      if (!viewerDeletePending) {
        viewerDeletePending = true;
        viewer.delBtn.textContent = 'Confirm delete';
        viewer.delBtn.classList.add('is-confirm');
      } else {
        const photo = viewerPhotos[viewerIndex];
        if (!photo) return;
        await deletePhoto(photo.id);
        viewerPhotos = viewerPhotos.filter((_, i) => i !== viewerIndex);
        if (!viewerPhotos.length) {
          closeViewer();
        } else {
          showViewerPhoto(Math.min(viewerIndex, viewerPhotos.length - 1));
        }
        await renderDay();
      }
    });
  }

  // Keyboard: Escape closes overlays (viewer first, then compose); viewer arrows cycle photos.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (viewer.overlay && !viewer.overlay.hidden) { closeViewer(); return; }
      if (compose.overlay && !compose.overlay.hidden) { closeCompose(); return; }
    }
    if (viewer.overlay && !viewer.overlay.hidden) {
      if (e.key === 'ArrowLeft' && viewerIndex > 0) showViewerPhoto(viewerIndex - 1);
      if (e.key === 'ArrowRight' && viewerIndex < viewerPhotos.length - 1) showViewerPhoto(viewerIndex + 1);
    }
  });

  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn && settingsBtn.addEventListener('click', () => window.openSettings && window.openSettings());

  renderDay();
}

init();
