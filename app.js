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
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
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
// State + DOM refs
// ------------------------------------------------------------------
let currentDate = startOfDay(new Date());

const els = {
  date:  document.getElementById('day-date'),
  prev:  document.getElementById('day-prev'),
  next:  document.getElementById('day-next'),
  today: document.getElementById('day-today'),
  form:  document.getElementById('add-form'),
  input: document.getElementById('add-input'),
  list:  document.getElementById('entry-list'),
};

// ------------------------------------------------------------------
// Data access
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
// Actions
// ------------------------------------------------------------------
async function addEntry(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const onToday = isoDate(currentDate) === isoDate(new Date());
  // For past days, anchor the moment to noon so it can't drift across a day boundary.
  const timestamp = onToday ? Date.now() : startOfDay(currentDate).getTime() + 12 * 3600 * 1000;
  await db.entries.add({
    uuid: uuid(),
    type: 'gratitude',
    timestamp,
    iso_date: isoDate(currentDate),
    text: trimmed,
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

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------
async function renderDay() {
  applySeason(currentDate);
  if (els.date) els.date.textContent = formatHeading(currentDate);
  const entries = await getEntriesForDate(currentDate);
  entries.sort((a, b) => a.timestamp - b.timestamp);

  els.list.innerHTML = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'entry-empty';
    li.textContent = 'Nothing here yet.';
    els.list.appendChild(li);
    return;
  }
  // Hand-drawn crayon cards; cycle three sketch variants so neighbours differ.
  // (Phase 4 will group by category and colour each card by its category.)
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = `entry s${(i % 3) + 1}`;

    const p = document.createElement('p');
    p.className = 'entry-text';
    p.textContent = e.text;

    const time = document.createElement('span');
    time.className = 'entry-time';
    time.textContent = formatTime(e.timestamp);

    const del = document.createElement('button');
    del.className = 'entry-del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete entry');
    del.textContent = '×';
    del.addEventListener('click', () => deleteEntry(e.id));

    li.append(p, time, del);
    els.list.appendChild(li);
  });
}
window.renderDay = renderDay;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
function init() {
  els.prev && els.prev.addEventListener('click', () => setDate(addDays(currentDate, -1)));
  els.next && els.next.addEventListener('click', () => setDate(addDays(currentDate, 1)));
  els.today && els.today.addEventListener('click', () => setDate(new Date()));

  els.form && els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    addEntry(els.input.value);
    els.input.value = '';
    els.input.focus();
  });

  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn && settingsBtn.addEventListener('click', () => window.openSettings && window.openSettings());

  renderDay();
}

init();
